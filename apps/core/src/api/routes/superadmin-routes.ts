import { checkSeatLimit } from "@engenty/entitlements";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { createPackagesDal } from "../../dal/packages.js";
import { createSuperadminDal } from "../../dal/superadmin.js";
import type {
  ApprovalDecision,
  createApprovalService,
} from "../../security/approval-service.js";
import {
  createNoopAuditLog,
  type SecurityAuditLogAdapter,
} from "../../security/audit-adapter.js";
import { recordCoreAuditEvent } from "../../security/audit-service.js";
import { jsonApiError, jsonApiSuccess } from "./api-response.js";
import { requireSuperAdmin } from "./authz.js";

type ApprovalService = ReturnType<typeof createApprovalService>;

const APPROVAL_DECISIONS: ApprovalDecision[] = [
  "allow_once",
  "allow_session",
  "allow_policy",
  "deny",
];

const TENANT_TIERS = ["platform", "satellite"] as const;
const TENANT_STATUSES = [
  "active",
  "suspended",
  "provisioning",
  "archived",
] as const;

type TenantTier = (typeof TENANT_TIERS)[number];
type TenantStatus = (typeof TENANT_STATUSES)[number];

function isTenantTier(value: unknown): value is TenantTier {
  return TENANT_TIERS.includes(value as TenantTier);
}

export function registerSuperadminRoutes(params: {
  app: OpenAPIHono;
  config: Record<string, unknown>;
  createDal?: typeof createSuperadminDal;
  /**
   * Cross-tenant audit reader. Unlike `/api/security/audit/events` (pinned to
   * the caller's own tenant), the superadmin routes below let a platform admin
   * query any tenant — or all tenants at once by omitting `tenant_id`.
   */
  auditLog?: SecurityAuditLogAdapter;
  /**
   * Cross-tenant approval queue. `/api/security/approvals` is tenant-scoped;
   * these superadmin routes let a platform admin see and decide any tenant's
   * pending requests. Optional so route-only tests can omit it.
   */
  approvalService?: ApprovalService;
  /** Resolve a tenant's seat entitlement. Injectable for tests. */
  resolveSeatLimit?: (tenantId: string) => Promise<{
    maxUsers: number | null;
    enforcement_mode: "observe" | "enforce";
  } | null>;
}) {
  const getDal = () => (params.createDal ?? createSuperadminDal)(params.config);
  const auditLog = params.auditLog ?? createNoopAuditLog();

  const resolveSeatLimit =
    params.resolveSeatLimit ??
    (async (tenantId: string) => {
      try {
        const resolved = await createPackagesDal(
          params.config
        ).getResolvedEntitlements(tenantId);
        return resolved.appLimits;
      } catch {
        return null; // fail open: never block on a resolution error
      }
    });

  // Returns an error Response when the tenant is at its enforced seat cap, else
  // null. Fails open (allows) when the limit can't be resolved.
  const seatLimitError = async (
    c: Parameters<typeof jsonApiError>[0],
    tenantId: string
  ) => {
    const appLimits = await resolveSeatLimit(tenantId);
    if (!appLimits || appLimits.maxUsers === null) {
      return null;
    }
    const current = (await getDal().listTenantMembers(tenantId)).length;
    const decision = checkSeatLimit(current, appLimits);
    if (decision.allowed) {
      return null;
    }
    return jsonApiError(c, 403, {
      code: "seat_limit_reached",
      message: `Seat limit reached for this tenant (${decision.current}/${decision.limit}). Upgrade the package or raise the maxUsers override.`,
    });
  };

  params.app.get("/api/superadmin/tenants", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenants = await getDal().listTenants();
    return jsonApiSuccess(c, tenants);
  });

  params.app.get("/api/superadmin/tenants/:id", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = c.req.param("id");
    const tenant = await getDal().getTenant(tenantId);
    if (!tenant) {
      return jsonApiError(c, 404, { message: "Tenant not found" });
    }
    return jsonApiSuccess(c, tenant);
  });

  params.app.post("/api/superadmin/tenants", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const body = (await c.req.json().catch(() => ({}))) as {
      slug?: string;
      name?: string;
      package_id?: string | null;
      tenant_connection_mode?: "shared_instance" | "dedicated_instance";
      tier?: string;
    };
    if (!(body.slug && body.name)) {
      return jsonApiError(c, 400, { message: "slug and name are required" });
    }
    if (body.tier !== undefined && !isTenantTier(body.tier)) {
      return jsonApiError(c, 400, {
        message: `tier must be one of: ${TENANT_TIERS.join(", ")}`,
      });
    }
    if (
      body.package_id !== undefined &&
      body.package_id !== null &&
      typeof body.package_id !== "string"
    ) {
      return jsonApiError(c, 400, { message: "package_id must be a string" });
    }
    const tenant = await getDal().createTenant({
      slug: body.slug,
      name: body.name,
      tenant_connection_mode: body.tenant_connection_mode ?? "shared_instance",
      ...(body.tier === undefined ? {} : { tier: body.tier as TenantTier }),
      ...(body.package_id === undefined
        ? {}
        : { package_id: body.package_id }),
    });
    return jsonApiSuccess(c, tenant);
  });

  params.app.patch("/api/superadmin/tenants/:id", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      slug?: string;
      name?: string;
      tenant_connection_mode?: "shared_instance" | "dedicated_instance";
      tier?: string;
    };
    if (body.tier !== undefined && !isTenantTier(body.tier)) {
      return jsonApiError(c, 400, {
        message: `tier must be one of: ${TENANT_TIERS.join(", ")}`,
      });
    }
    const tenant = await getDal().updateTenant(tenantId, {
      slug: body.slug,
      name: body.name,
      tenant_connection_mode: body.tenant_connection_mode,
      ...(body.tier === undefined ? {} : { tier: body.tier as TenantTier }),
    });
    return jsonApiSuccess(c, tenant);
  });

  params.app.post("/api/superadmin/tenants/:id/status", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const body = (await c.req.json().catch(() => ({}))) as { status?: string };
    if (!TENANT_STATUSES.includes(body.status as TenantStatus)) {
      return jsonApiError(c, 400, {
        message: `status must be one of: ${TENANT_STATUSES.join(", ")}`,
      });
    }
    const tenant = await getDal().updateTenantStatus(
      c.req.param("id"),
      body.status as TenantStatus
    );
    return jsonApiSuccess(c, tenant);
  });

  params.app.post("/api/superadmin/tenants/:id/switch", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = c.req.param("id");
    if (!authResult.auth.userId) {
      return jsonApiError(c, 401, { message: "Unauthorized" });
    }
    await getDal().switchCurrentUserTenant({
      userId: authResult.auth.userId,
      tenantId,
    });
    return jsonApiSuccess(c, { tenantId });
  });

  params.app.get("/api/superadmin/users", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = c.req.query("tenantId");
    if (tenantId) {
      const users = await getDal().listTenantMembers(tenantId);
      return jsonApiSuccess(c, users);
    }
    const users = await getDal().listUsers();
    return jsonApiSuccess(c, users);
  });

  params.app.get("/api/superadmin/users/:id", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const userId = c.req.param("id");
    const user = await getDal().getUser(userId);
    if (!user) {
      return jsonApiError(c, 404, { message: "User not found" });
    }
    const [tenant_memberships, identities] = await Promise.all([
      getDal().getUserTenantMemberships(userId),
      getDal().getAuthUserIdentities(userId),
    ]);
    return jsonApiSuccess(c, {
      user,
      tenant_memberships,
      identities,
    });
  });

  params.app.post("/api/superadmin/users", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const body = (await c.req.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
      display_name?: string;
      tenant_id?: string;
      role?: "admin" | "member";
      is_super_admin?: boolean;
    };
    if (!(body.email && body.tenant_id)) {
      return jsonApiError(c, 400, {
        message: "email and tenant_id are required",
      });
    }
    const seatErr = await seatLimitError(c, body.tenant_id);
    if (seatErr) {
      return seatErr;
    }
    try {
      const user = await getDal().createUser({
        email: body.email,
        password: body.password,
        display_name: body.display_name,
        tenant_id: body.tenant_id,
        role: body.role,
        is_super_admin: body.is_super_admin,
      });
      return jsonApiSuccess(c, user);
    } catch (err) {
      return jsonApiError(c, 400, {
        message: err instanceof Error ? err.message : "Failed to create user",
      });
    }
  });

  params.app.post("/api/superadmin/users/:id/password", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const userId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      newPassword?: string;
    };
    if (!body.newPassword || typeof body.newPassword !== "string") {
      return jsonApiError(c, 400, { message: "newPassword is required" });
    }
    try {
      await getDal().updateUserPassword(userId, body.newPassword);
      return jsonApiSuccess(c, { updated: true });
    } catch (err) {
      return jsonApiError(c, 400, {
        message:
          err instanceof Error ? err.message : "Failed to update password",
      });
    }
  });

  params.app.patch("/api/superadmin/users/:id", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const userId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
      display_name?: string;
      tenant_id?: string;
      role?: "admin" | "member";
      is_super_admin?: boolean;
    };
    try {
      const user = await getDal().updateUser(userId, {
        email: body.email,
        password: body.password,
        display_name: body.display_name,
        tenant_id: body.tenant_id,
        role: body.role,
        is_super_admin: body.is_super_admin,
      });
      return jsonApiSuccess(c, user);
    } catch (err) {
      return jsonApiError(c, 400, {
        message: err instanceof Error ? err.message : "Failed to update user",
      });
    }
  });

  params.app.post("/api/superadmin/tenants/:id/users", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      userId?: string;
      role?: "admin" | "member";
    };
    if (!body.userId) {
      return jsonApiError(c, 400, { message: "userId is required" });
    }
    const seatErr = await seatLimitError(c, tenantId);
    if (seatErr) {
      return seatErr;
    }
    await getDal().assignUserToTenant({
      userId: body.userId,
      tenantId,
      role: body.role ?? "member",
    });
    return jsonApiSuccess(c, { assigned: true });
  });

  params.app.patch("/api/superadmin/tenants/:id/users/:userId", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = c.req.param("id");
    const userId = c.req.param("userId");
    const body = (await c.req.json().catch(() => ({}))) as {
      role?: "admin" | "member";
    };
    if (!body.role) {
      return jsonApiError(c, 400, { message: "role is required" });
    }
    await getDal().updateTenantMemberRole({
      userId,
      tenantId,
      role: body.role,
    });
    return jsonApiSuccess(c, { updated: true });
  });

  params.app.delete("/api/superadmin/tenants/:id/users/:userId", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = c.req.param("id");
    const userId = c.req.param("userId");
    await getDal().removeUserFromTenant({ userId, tenantId });
    return jsonApiSuccess(c, { removed: true });
  });

  params.app.get("/api/superadmin/tenants/:id/automation-rules", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = c.req.param("id");
    const hookId = c.req.query("hookId")?.trim() || undefined;
    const rules = await getDal().listAutomationRules(tenantId, { hookId });
    return jsonApiSuccess(c, rules);
  });

  params.app.post("/api/superadmin/tenants/:id/automation-rules", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      hook_id?: string;
      enabled?: boolean;
      filter_json?: Record<string, unknown>;
      effect_type?: "action" | "agent";
      effect_id?: string;
      effect_input_json?: Record<string, unknown> | null;
    };
    if (!(body.hook_id && body.effect_type && body.effect_id)) {
      return jsonApiError(c, 400, {
        message: "hook_id, effect_type, and effect_id are required",
      });
    }
    try {
      const row = await getDal().createAutomationRule(tenantId, {
        hook_id: body.hook_id,
        enabled: body.enabled,
        filter_json: body.filter_json,
        effect_type: body.effect_type,
        effect_id: body.effect_id,
        effect_input_json: body.effect_input_json,
      });
      return jsonApiSuccess(c, row);
    } catch (err) {
      return jsonApiError(c, 400, {
        message:
          err instanceof Error
            ? err.message
            : "Failed to create automation rule",
      });
    }
  });

  params.app.patch(
    "/api/superadmin/tenants/:id/automation-rules/:ruleId",
    async (c) => {
      const authResult = await requireSuperAdmin(c, params.config);
      if ("error" in authResult) {
        return authResult.error;
      }
      const tenantId = c.req.param("id");
      const ruleId = c.req.param("ruleId");
      const body = (await c.req.json().catch(() => ({}))) as {
        enabled?: boolean;
        hook_id?: string;
        filter_json?: Record<string, unknown>;
        effect_type?: "action" | "agent";
        effect_id?: string;
        effect_input_json?: Record<string, unknown> | null;
      };
      try {
        const row = await getDal().patchAutomationRule(tenantId, ruleId, body);
        return jsonApiSuccess(c, row);
      } catch (err) {
        return jsonApiError(c, 400, {
          message:
            err instanceof Error
              ? err.message
              : "Failed to update automation rule",
        });
      }
    }
  );

  params.app.delete(
    "/api/superadmin/tenants/:id/automation-rules/:ruleId",
    async (c) => {
      const authResult = await requireSuperAdmin(c, params.config);
      if ("error" in authResult) {
        return authResult.error;
      }
      const tenantId = c.req.param("id");
      const ruleId = c.req.param("ruleId");
      try {
        await getDal().deleteAutomationRule(tenantId, ruleId);
        return jsonApiSuccess(c, { deleted: true });
      } catch (err) {
        return jsonApiError(c, 400, {
          message:
            err instanceof Error
              ? err.message
              : "Failed to delete automation rule",
        });
      }
    }
  );

  // Cross-tenant audit event feed. `tenant_id` optional: omit to see every
  // tenant, pass one to scope. Mirrors the shape of /api/security/audit/events
  // (events + total + has_more) so the manage UI can page through results.
  params.app.get("/api/superadmin/audit/events", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const limit = Math.min(Number(c.req.query("limit") ?? 100) || 100, 500);
    const page = Math.max(0, Number(c.req.query("page") ?? 0) || 0);
    const typesRaw = c.req.query("types");
    const types = typesRaw
      ? typesRaw
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : undefined;
    const from = c.req.query("from")?.trim();
    const to = c.req.query("to")?.trim();
    const options = {
      limit,
      offset: page * limit,
      search: c.req.query("search")?.trim() || undefined,
      types,
      actor_id: c.req.query("actor_id")?.trim() || undefined,
      module_id: c.req.query("module_id")?.trim() || undefined,
      tenant_id: c.req.query("tenant_id")?.trim() || undefined,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to).toISOString() : undefined,
    };

    const [events, total] = await Promise.all([
      auditLog.list(limit, options),
      auditLog.count(options),
    ]);
    const mapped = events.map((row) => ({
      ...row,
      detail: row.detail
        ? (JSON.parse(row.detail) as Record<string, unknown>)
        : {},
    }));
    return jsonApiSuccess(c, {
      events: mapped,
      has_more: page * limit + events.length < total,
      total,
    });
  });

  // Distinct filter values (types, module_ids) for the audit filter controls.
  params.app.get("/api/superadmin/audit/distincts", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenant_id = c.req.query("tenant_id")?.trim() || undefined;
    const distincts = await auditLog.distincts(tenant_id);
    return jsonApiSuccess(c, distincts);
  });

  // Cross-tenant pending approval queue. Unlike /api/security/approvals (scoped
  // to the caller's tenant), this returns every tenant's pending requests.
  params.app.get("/api/superadmin/approvals", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const pending = params.approvalService?.listPending() ?? [];
    return jsonApiSuccess(c, pending);
  });

  // Decide any tenant's approval request as a platform admin.
  params.app.post("/api/superadmin/approvals/:id/decision", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const approvalService = params.approvalService;
    if (!approvalService) {
      return jsonApiError(c, 503, { message: "Approvals unavailable" });
    }
    const body = (await c.req.json().catch(() => ({}))) as {
      decision?: ApprovalDecision;
    };
    const decision = body.decision;
    if (!(decision && APPROVAL_DECISIONS.includes(decision))) {
      return jsonApiError(c, 400, { message: "Invalid decision" });
    }
    const decided = approvalService.decide({
      requestId: c.req.param("id"),
      decision,
      decidedBy: authResult.auth.userId ?? "",
    });
    if (!decided) {
      return jsonApiError(c, 404, { message: "Approval request not found" });
    }
    recordCoreAuditEvent(auditLog, {
      type: "approval.decided",
      actorId: authResult.auth.userId ?? undefined,
      tenantId: decided.tenantId,
      moduleId: decided.moduleId,
      operationId: decided.operationId,
      detail: { requestId: decided.id, decision, viaSuperadmin: true },
    });
    return jsonApiSuccess(c, decided);
  });
}
