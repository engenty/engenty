/**
 * HTTP edge for the operation pipeline: resolve the principal, run
 * `invokeOperation`, and turn its `InvokeOperationError` into a response.
 *
 * Every envelope this can produce is built here, once. The pipeline itself only
 * ever throws, so the in-process, MCP and HTTP callers cannot drift apart the
 * way they did while each carried its own copy of the security stages.
 */
import { formatZodErrorForApiError, isZodError } from "@engenty/api-contracts";
import type { createApprovalService } from "@engenty/approvals-sdk";
import { isPluginOperationError } from "@engenty/plugin-sdk";
import type { PluginRegistry } from "../../../plugins/registry.js";
import type { SecurityAuditLogAdapter } from "../../../security/audit-adapter.js";
import type { AuthProvider } from "../../../security/auth-provider.js";
import type { PolicyDeps } from "../../../security/policy.js";
import { jsonApiError, jsonApiSuccess } from "../api-response.js";
import { requireAuth } from "./module-operation-auth.js";
import {
  invokeOperation,
  type OperationTransport,
} from "./module-operation-invoke.js";
import {
  type ApprovalRequiredBody,
  buildOperationMap,
  type ForbiddenBody,
  type HonoJsonContext,
  InvokeOperationError,
  type OperationRoutesContext,
  type TenantPluginOverrideResolver,
} from "./module-operation-shared.js";

type ApprovalService = ReturnType<typeof createApprovalService>;

interface ResponseContext {
  json: (body: unknown, status?: number) => Response;
}

/**
 * The pipeline's answers, in the envelope each has always had at this edge.
 * `kind` distinguishes the 403s, which otherwise carry identical fields.
 */
function invokeErrorToHttpResponse(
  c: ResponseContext,
  e: InvokeOperationError
): Response {
  const body = e.body as Record<string, unknown> | undefined;
  const kind = (body as ForbiddenBody | undefined)?.kind;
  if (kind === "capability_denied") {
    const forbidden = body as unknown as ForbiddenBody;
    return jsonApiError(c, 403, {
      code: forbidden.reason ?? "capability_denied",
      message: "Capability unavailable",
      details: {
        reason: forbidden.reason,
        diagnostics: forbidden.diagnostics,
      },
    });
  }
  if (kind === "policy_denied") {
    return jsonApiError(c, 403, {
      message: "Forbidden",
      details: { reason: (body as unknown as ForbiddenBody).reason },
    });
  }
  if (kind === "interceptor_blocked") {
    const forbidden = body as unknown as ForbiddenBody;
    return jsonApiError(c, e.status, {
      message: e.message,
      details: { error: forbidden.error, reason: forbidden.reason },
    });
  }
  if (body?.code === "approval_required") {
    const approval = body as unknown as ApprovalRequiredBody;
    return jsonApiError(c, 202, {
      code: "approval_required",
      message: "Approval required",
      details: {
        approvalRequestId: approval.approvalRequestId,
        expiresAt: approval.expiresAt,
        reason: approval.reason,
        riskLevel: approval.riskLevel,
        requiresApproval: approval.requiresApproval,
      },
    });
  }
  if (body?.code === "in_process_policy_denied") {
    return jsonApiError(c, 403, {
      code: "in_process_policy_denied",
      message: e.message,
      details: { reason: body.reason, operationId: body.operationId },
    });
  }
  return jsonApiError(c, e.status, {
    ...(typeof body?.code === "string" ? { code: body.code } : {}),
    ...(body?.details === undefined ? {} : { details: body.details }),
    ...(body?.fields === undefined
      ? {}
      : { fields: body.fields as Record<string, string[]> }),
    message: typeof body?.message === "string" ? body.message : e.message,
  });
}

export async function executeModuleOperation(params: {
  c: {
    req: {
      header: (name: string) => string | undefined;
    };
    json: (body: unknown, status?: number) => Response;
  };
  registry: PluginRegistry;
  config: Record<string, unknown>;
  dataDir: string;
  resolvePath: (p: string) => string;
  operationId: string;
  input: unknown;
  transport?: OperationTransport;
  authProvider: AuthProvider;
  approvalService: ApprovalService;
  auditLog: SecurityAuditLogAdapter;
  resolveAgentApproval?: PolicyDeps["resolveAgentApproval"];
  resolveTenantPluginOverrides?: TenantPluginOverrideResolver;
}) {
  const authResult = await requireAuth(params.c, params.authProvider);
  if (authResult.error || !authResult.auth) {
    return authResult.error!;
  }
  try {
    const { data } = await invokeOperation({
      approvalService: params.approvalService,
      auditLog: params.auditLog,
      auth: authResult.auth,
      config: params.config,
      dataDir: params.dataDir,
      input: params.input,
      operationId: params.operationId,
      registry: params.registry,
      resolvePath: params.resolvePath,
      transport: params.transport ?? "module_ops",
      ...(params.resolveAgentApproval
        ? { resolveAgentApproval: params.resolveAgentApproval }
        : {}),
      ...(params.resolveTenantPluginOverrides
        ? { resolveTenantPluginOverrides: params.resolveTenantPluginOverrides }
        : {}),
    });
    return jsonApiSuccess(params.c, data);
  } catch (e) {
    if (e instanceof InvokeOperationError) {
      return invokeErrorToHttpResponse(params.c, e);
    }
    // The pipeline translates these already; this stays for anything thrown
    // before it takes over, so a typed answer is never reported as a fault.
    if (isPluginOperationError(e)) {
      return jsonApiError(params.c, e.status, {
        code: e.code,
        message: e.message,
        ...(e.details ? { details: e.details } : {}),
      });
    }
    if (isZodError(e)) {
      return jsonApiError(params.c, 400, formatZodErrorForApiError(e));
    }
    throw e;
  }
}

export async function invokeOperationFromRoute(
  c: HonoJsonContext,
  params: OperationRoutesContext & {
    moduleId?: string;
    operationId: string;
    publicName: "operation" | "tool";
  }
) {
  if (params.moduleId) {
    const entry = buildOperationMap(params.registry).get(params.operationId);
    if (!entry) {
      return jsonApiError(c, 404, {
        message: `Unknown module ${params.publicName}: ${params.operationId}`,
      });
    }
    if (entry.operation.moduleId !== params.moduleId) {
      return jsonApiError(c, 404, {
        message: `Unknown module ${params.publicName}: ${params.operationId}`,
        details: {
          moduleId: params.moduleId,
          toolId: params.operationId,
        },
      });
    }
  }
  const body = (await c.req.json().catch(() => ({}))) as { input?: unknown };
  return executeModuleOperation({
    c,
    registry: params.registry,
    config: params.config,
    dataDir: params.dataDir,
    resolvePath: params.resolvePath,
    operationId: params.operationId,
    input: body.input ?? {},
    transport: "module_ops",
    authProvider: params.authProvider,
    approvalService: params.approvalService,
    auditLog: params.auditLog,
    resolveTenantPluginOverrides: params.resolveTenantPluginOverrides,
    ...(params.resolveAgentApproval
      ? { resolveAgentApproval: params.resolveAgentApproval }
      : {}),
  });
}
