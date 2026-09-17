/**
 * Approval queue HTTP routes (list + decide).
 */
import type { ApprovalDecision } from "@engenty/approvals-sdk";
import { capabilityCovers } from "@engenty/plugin-sdk";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { ApprovalDecidedEvent } from "../../../security/approval-gate.js";
import type { SecurityAuditLogAdapter } from "../../../security/audit-adapter.js";
import { enrichAuditEventsWithUsers } from "../../../security/audit-enrich.js";
import { recordCoreAuditEvent } from "../../../security/audit-service.js";
import type { AuthProvider } from "../../../security/auth-provider.js";
import { jsonApiError, jsonApiSuccess } from "../api-response.js";
import { requireAuth, requireAuthForAudit } from "./module-operation-auth.js";
import type { ApprovalService } from "./module-operation-shared.js";

export function registerApprovalRoutes(params: {
  app: OpenAPIHono;
  config: Record<string, unknown>;
  authProvider: AuthProvider;
  approvalService: ApprovalService;
  auditLog: SecurityAuditLogAdapter;
  /** After a decision lands: `emitApprovalDecided` (notifications resolve on it). */
  onDecided?: (event: ApprovalDecidedEvent) => Promise<void>;
}) {
  params.app.get("/api/security/approvals", async (c) => {
    const authResult = await requireAuth(c, params.authProvider);
    if (authResult.error || !authResult.auth) {
      return authResult.error!;
    }
    // Scope to the caller's tenant: a user only sees approvals for operations in
    // their own tenant. The cross-tenant queue lives at /api/superadmin/approvals.
    // The filter is the store's, not a post-filter here — listing every tenant's
    // queue and narrowing it in JS put one missed line between two tenants.
    const pending = await params.approvalService.listPending(
      authResult.auth.tenantId
    );
    return jsonApiSuccess(c, pending);
  });

  params.app.post("/api/security/approvals/:id/decision", async (c) => {
    const authResult = await requireAuth(c, params.authProvider);
    if (authResult.error || !authResult.auth) {
      return authResult.error!;
    }
    const body = (await c.req.json().catch(() => ({}))) as {
      decision?: ApprovalDecision;
      subject_id?: unknown;
    };
    const decision = body.decision;
    // Optional subject binding (chat passes its thread id = the run's goal).
    // Narrowing only: it restricts which runs may spend the grant, so no
    // authorization check beyond the tenant scoping already done below.
    const subjectId =
      typeof body.subject_id === "string" && body.subject_id.length <= 128
        ? body.subject_id
        : undefined;
    if (
      decision !== "allow_once" &&
      decision !== "allow_session" &&
      decision !== "allow_policy" &&
      decision !== "deny"
    ) {
      return jsonApiError(c, 400, { message: "Invalid decision" });
    }
    // Only decide requests in the caller's own tenant. Answer 404 (not 403) for
    // a foreign id so we don't reveal that another tenant's request exists.
    const existing = await params.approvalService.get(c.req.param("id"));
    if (!existing || existing.tenantId !== authResult.auth.tenantId) {
      return jsonApiError(c, 404, { message: "Approval request not found" });
    }
    // First to answer wins: a request is decidable by everyone who sees it,
    // so the second person to click learns who was faster, not "not found".
    if (existing.status !== "pending") {
      return jsonApiError(c, 409, {
        code: "approvals.alreadyDecided",
        details: {
          decided_by: existing.decidedBy ?? null,
          status: existing.status,
        },
        message:
          existing.status === "expired"
            ? "This request expired before anyone decided it."
            : "This request was already decided by someone else.",
      });
    }
    // PLAN-spaces.md CN.6/3 — being in the tenant is not being the person the
    // request was addressed to. A module that knows who owns the thing at
    // stake says so in the request context; without it, tenant scope remains
    // the rule, which is the pre-existing behaviour for every other module.
    //
    // 403 rather than 404 here: the caller can already SEE this request in
    // their queue, so hiding it would be theatre — what they need to be told
    // is that it is not theirs to answer.
    const approverUserId =
      typeof existing.context?.owner_user_id === "string"
        ? existing.context.owner_user_id
        : null;
    if (
      approverUserId &&
      approverUserId !== authResult.auth.principalId &&
      !capabilityCovers(
        [...(authResult.auth.capabilities ?? [])],
        "core.users.manage"
      )
    ) {
      return jsonApiError(c, 403, {
        message:
          "Only the owner of the connection this request is about (or a tenant admin) can decide it.",
      });
    }
    const decided = await params.approvalService.decide({
      requestId: c.req.param("id"),
      tenantId: authResult.auth.tenantId,
      decision,
      decidedBy: authResult.auth.principalId,
      sessionId: authResult.auth.sessionId,
      ...(subjectId ? { subjectId } : {}),
    });
    if (!decided) {
      return jsonApiError(c, 404, { message: "Approval request not found" });
    }
    recordCoreAuditEvent(params.auditLog, {
      type: "approval.decided",
      actorId: authResult.auth.principalId,
      tenantId: authResult.auth.tenantId,
      moduleId: decided.moduleId,
      operationId: decided.operationId,
      detail: {
        requestId: decided.id,
        decision,
      },
    });
    await params.onDecided?.({
      actorId: authResult.auth.principalId ?? null,
      decision,
      moduleId: decided.moduleId,
      operationId: decided.operationId,
      requestId: decided.id,
      tenantId: authResult.auth.tenantId,
    });
    return jsonApiSuccess(c, decided);
  });

  params.app.get("/api/security/audit/events", async (c) => {
    const authResult = await requireAuthForAudit(c, params.authProvider);
    if (authResult.error || !authResult.auth) {
      return authResult.error!;
    }
    let tenant_id = c.req.query("tenant_id")?.trim() || undefined;
    if (authResult.auth.tenantId && !tenant_id) {
      tenant_id = authResult.auth.tenantId;
    }
    if (
      tenant_id &&
      authResult.auth.tenantId &&
      tenant_id !== authResult.auth.tenantId
    ) {
      return jsonApiError(c, 403, { message: "Forbidden" });
    }
    const limit = Math.min(Number(c.req.query("limit") ?? 200) || 200, 500);
    const page = Math.max(0, Number(c.req.query("page") ?? 0) || 0);
    const search = c.req.query("search")?.trim() || undefined;
    const typesRaw = c.req.query("types");
    const types = typesRaw
      ? typesRaw
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined;
    const actor_id = c.req.query("actor_id")?.trim() || undefined;
    const module_id = c.req.query("module_id")?.trim() || undefined;
    const from = c.req.query("from")?.trim() || undefined;
    const to = c.req.query("to")?.trim() || undefined;

    const listOptions = {
      limit,
      offset: page * limit,
      search,
      types,
      actor_id,
      module_id,
      tenant_id,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to).toISOString() : undefined,
    };
    const countOptions = {
      search,
      types,
      actor_id,
      module_id,
      tenant_id,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to).toISOString() : undefined,
    };

    const [events, total] = await Promise.all([
      params.auditLog.list(limit, listOptions),
      params.auditLog.count(countOptions),
    ]);
    const mapped = events.map((r) => ({
      ...r,
      detail: r.detail ? (JSON.parse(r.detail) as Record<string, unknown>) : {},
    }));
    const enriched = await enrichAuditEventsWithUsers(params.config, mapped, {
      tenantId: tenant_id,
    });
    return jsonApiSuccess(c, {
      events: enriched,
      has_more: page * limit + events.length < total,
      total,
    });
  });

  params.app.get("/api/security/audit/distincts", async (c) => {
    const authResult = await requireAuthForAudit(c, params.authProvider);
    if (authResult.error || !authResult.auth) {
      return authResult.error!;
    }
    let tenant_id = c.req.query("tenant_id")?.trim() || undefined;
    if (authResult.auth.tenantId && !tenant_id) {
      tenant_id = authResult.auth.tenantId;
    }
    if (
      tenant_id &&
      authResult.auth.tenantId &&
      tenant_id !== authResult.auth.tenantId
    ) {
      return jsonApiError(c, 403, { message: "Forbidden" });
    }
    const distincts = await params.auditLog.distincts(tenant_id);
    return jsonApiSuccess(c, distincts);
  });
}
