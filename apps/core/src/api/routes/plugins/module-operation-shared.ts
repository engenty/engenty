/**
 * Shared types and helpers for the module-operation HTTP surface.
 * Split from the former monolithic module-operation-routes.ts.
 */
import { formatZodErrorForApiError, isZodError } from "@engenty/api-contracts";
import type { createApprovalService } from "@engenty/approvals-sdk";
import {
  OPERATION_SPACE_POLICY_KINDS,
  operationSpacePolicySchema,
} from "@engenty/plugin-sdk";
import { createRoute, z } from "@hono/zod-openapi";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSpaceResourceSurface } from "../../../dal/space-mounts.js";
import { findSpaceIdForRecord } from "../../../dal/space-record-lookup.js";
import type { PluginRegistry } from "../../../plugins/registry.js";
import type { SecurityAuditLogAdapter } from "../../../security/audit-adapter.js";
import { recordModuleAuditEvent } from "../../../security/audit-service.js";
import type { PrincipalContext } from "../../../security/auth.js";
import type { AuthProvider } from "../../../security/auth-provider.js";
import type { PolicyDeps } from "../../../security/policy.js";
import {
  enforceOperationSpacePolicy,
  type FindRecordSpaceId,
  type IsConnectionMounted,
  prepareOperationSpaceInput,
} from "./module-operation-space-policy.js";

export type ApprovalService = ReturnType<typeof createApprovalService>;

export type OperationEntry = PluginRegistry["moduleOperations"][number];

export const CORE_PLUGIN_ID = "core";

export type TenantPluginOverrideResolver = (
  tenantId: string
) => Promise<Record<string, boolean>>;

export interface OperationRoutesContext {
  approvalService: ApprovalService;
  auditLog: SecurityAuditLogAdapter;
  authProvider: AuthProvider;
  config: Record<string, unknown>;
  dataDir: string;
  registry: PluginRegistry;
  resolveAgentApproval?: PolicyDeps["resolveAgentApproval"];
  resolvePath: (p: string) => string;
  resolveTenantPluginOverrides?: TenantPluginOverrideResolver;
}

export interface HonoJsonContext {
  json: (body: unknown, status?: number) => Response;
  req: {
    header: (name: string) => string | undefined;
    json: () => Promise<unknown>;
    param: (name: string) => string;
  };
}

export interface HonoGetContext {
  json: (body: unknown, status?: number) => Response;
  req: {
    header: (name: string) => string | undefined;
    param: (name: string) => string;
  };
}

export type OperationEventName =
  | "operation.afterInvoke"
  | "operation.beforeInvoke"
  | "operation.context"
  | "operation.error";

export function operationEventPayload(params: {
  auth: PrincipalContext;
  input?: unknown;
  moduleId: string;
  /** The contract, for subscribers that only care about writes by agents. */
  op?: { idempotent?: boolean; riskLevel?: string };
  operationId: string;
  result?: unknown;
  transport: "gateway" | "http" | "module_ops" | "mcp";
}): Record<string, unknown> {
  return {
    actor_id: params.auth.principalId,
    ...(params.auth.agentId ? { agent_id: params.auth.agentId } : {}),
    ...(params.op?.idempotent === undefined
      ? {}
      : { idempotent: params.op.idempotent }),
    input: params.input,
    module_id: params.moduleId,
    operation_id: params.operationId,
    principal_type: params.auth.principalType,
    result: params.result,
    ...(params.op?.riskLevel ? { risk_level: params.op.riskLevel } : {}),
    ...(params.auth.spaceId ? { space_id: params.auth.spaceId } : {}),
    tenant_id: params.auth.tenantId,
    transport: params.transport,
  };
}

export async function emitCoreOperationEvent(params: {
  auth: PrincipalContext;
  eventName: OperationEventName;
  payload: Record<string, unknown>;
  registry: PluginRegistry;
}) {
  await params.registry.eventsRuntime?.api.core.emit(
    params.eventName,
    params.payload,
    {
      actorId: params.auth.principalId,
      principalId: params.auth.principalId,
      sourceModuleId: "core",
      tenantId: params.auth.tenantId,
    }
  );
}

export async function runBeforeOperationInterceptors(params: {
  auth: PrincipalContext;
  auditLog: SecurityAuditLogAdapter;
  moduleId: string;
  operationId: string;
  payload: Record<string, unknown>;
  registry: PluginRegistry;
}) {
  const decision = await params.registry.eventsRuntime?.runInterceptors(
    "operation.beforeInvoke",
    params.payload,
    {
      actorId: params.auth.principalId,
      principalId: params.auth.principalId,
      sourceModuleId: "core",
      tenantId: params.auth.tenantId,
    }
  );
  if (decision?.action !== "block") {
    return;
  }
  recordModuleAuditEvent(params.auditLog, params.moduleId, {
    type: "operation.intercepted",
    actorId: params.auth.principalId,
    tenantId: params.auth.tenantId,
    moduleId: params.moduleId,
    operationId: params.operationId,
    detail: { reason: decision.reason },
  });
  throw new InvokeOperationError(
    decision.reason ?? "Operation blocked",
    403,
    forbiddenBody("interceptor_blocked", decision.reason)
  );
}

export async function applyOperationContextFilters(params: {
  auth: PrincipalContext;
  payload: Record<string, unknown>;
  registry: PluginRegistry;
}) {
  await params.registry.eventsRuntime?.applyFilters(
    "operation.context",
    params.payload,
    {
      actorId: params.auth.principalId,
      principalId: params.auth.principalId,
      sourceModuleId: "core",
      tenantId: params.auth.tenantId,
    }
  );
}

export function buildOperationMap(
  registry: PluginRegistry
): Map<string, OperationEntry> {
  const entries = new Map<string, OperationEntry>();
  for (const op of registry.moduleOperations) {
    entries.set(op.operationId, op);
  }
  return entries;
}

export function isCoreOwnedOperation(pluginId: string): boolean {
  return pluginId === CORE_PLUGIN_ID;
}

export function operationSpacePolicyDeps(
  registry: PluginRegistry,
  auth: PrincipalContext
): {
  findRecordSpaceId?: FindRecordSpaceId;
  isConnectionMounted?: IsConnectionMounted;
} {
  const getTenantDb = registry.getTenantDb;
  if (!getTenantDb) {
    return {};
  }
  const findRecordSpaceId: FindRecordSpaceId = async (input) => {
    const client = getTenantDb({ tenantId: input.tenantId });
    if (!client) {
      return null;
    }
    return findSpaceIdForRecord(client as SupabaseClient, input);
  };
  const spaceId = auth.spaceId?.trim();
  if (!spaceId) {
    return { findRecordSpaceId };
  }
  const isConnectionMounted: IsConnectionMounted = async (connectionId) => {
    const client = getTenantDb({ tenantId: auth.tenantId });
    if (!client) {
      return false;
    }
    const surface = await resolveSpaceResourceSurface(
      client as SupabaseClient,
      auth.tenantId,
      spaceId
    );
    return surface.connections.includes(connectionId);
  };
  return { findRecordSpaceId, isConnectionMounted };
}

export async function applyDispatchSpacePolicy(params: {
  auth: PrincipalContext;
  input: unknown;
  parse: (input: unknown) => unknown;
  policy: OperationEntry["operation"]["spacePolicy"];
  registry: PluginRegistry;
}): Promise<unknown> {
  const prepared = prepareOperationSpaceInput({
    auth: params.auth,
    input: params.input,
    policy: params.policy,
  });
  const parsed = params.parse(prepared);
  return enforceOperationSpacePolicy({
    auth: params.auth,
    input: parsed,
    policy: params.policy,
    ...operationSpacePolicyDeps(params.registry, params.auth),
  });
}

export const schemaSummarySchema = z.object({
  type: z.enum(["zod", "none"]),
  hint: z.string().optional(),
});

export const operationContractSchema = z.object({
  operationId: z.string(),
  toolId: z.string(),
  methodName: z.string(),
  pluginId: z.string(),
  moduleId: z.string(),
  summary: z.string().optional(),
  description: z.string().optional(),
  inputSchema: schemaSummarySchema,
  outputSchema: schemaSummarySchema,
  auth: z.object({
    requiredCapabilities: z.array(z.string()),
    requiredPermissions: z.array(z.string()),
    requiredScopes: z.array(z.string()),
    riskLevel: z.enum(["low", "medium", "high", "critical"]),
    requiresApproval: z.boolean(),
    allowedPrincipalTypes: z.array(z.enum(["user", "agent", "service"])),
  }),
  transports: z.array(z.enum(["rest", "cli", "mcp"])),
  mcp: z
    .object({
      annotations: z
        .object({
          destructiveHint: z.boolean().optional(),
          idempotentHint: z.boolean().optional(),
          openWorldHint: z.boolean().optional(),
          readOnlyHint: z.boolean().optional(),
        })
        .optional(),
      appResourceUri: z.string().optional(),
      declared: z.boolean(),
      disposition: z.enum(["default", "explicit_grant", "never"]),
      enabled: z.boolean(),
      taskCapable: z.boolean(),
    })
    .optional(),
  record_scope: z.enum(OPERATION_SPACE_POLICY_KINDS).optional(),
  spacePolicy: operationSpacePolicySchema.optional(),
});

export const apiErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    fields: z.record(z.string(), z.array(z.string())).optional(),
  }),
});

export const toolInvokeBodySchema = z.object({
  input: z.unknown().optional(),
});

export const toolInvokeSuccessSchema = z.object({
  ok: z.literal(true),
  data: z.unknown(),
});

export const listOperationContractsRoute = createRoute({
  method: "get",
  path: "/api/operations/contracts",
  summary: "List tool contracts (operation compatibility)",
  description:
    "Compatibility route for discovering callable tool contracts available to the authenticated principal. Prefer /api/tools/contracts.",
  tags: ["Tools"],
  responses: {
    200: {
      description: "Available tool contracts",
      content: {
        "application/json": {
          schema: z.object({
            ok: z.literal(true),
            data: z.array(operationContractSchema),
          }),
        },
      },
    },
    401: {
      description: "Unauthorized",
      content: { "application/json": { schema: apiErrorResponseSchema } },
    },
  },
});

export const getOperationContractRoute = createRoute({
  method: "get",
  path: "/api/operations/contracts/:operationId",
  summary: "Get tool contract (operation compatibility)",
  description:
    "Compatibility route for fetching one callable tool contract after tenant and capability gating. Prefer /api/tools/contracts/:toolId.",
  tags: ["Tools"],
  request: {
    params: z.object({ operationId: z.string() }),
  },
  responses: {
    200: {
      description: "Tool contract",
      content: {
        "application/json": {
          schema: z.object({
            ok: z.literal(true),
            data: operationContractSchema,
          }),
        },
      },
    },
    401: {
      description: "Unauthorized",
      content: { "application/json": { schema: apiErrorResponseSchema } },
    },
    403: {
      description: "Tool contract unavailable",
      content: { "application/json": { schema: apiErrorResponseSchema } },
    },
    404: {
      description: "Tool contract not found",
      content: { "application/json": { schema: apiErrorResponseSchema } },
    },
  },
});

export const invokeOperationRoute = createRoute({
  method: "post",
  path: "/api/operations/:operationId/invoke",
  summary: "Invoke tool (operation compatibility)",
  description:
    "Compatibility route for invoking a callable tool through capability gating, policy, approval, audit, and schema validation. Prefer /api/tools/:toolId/invoke.",
  tags: ["Tools"],
  request: {
    params: z.object({ operationId: z.string() }),
    body: {
      content: {
        "application/json": {
          schema: toolInvokeBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Tool result",
      content: { "application/json": { schema: toolInvokeSuccessSchema } },
    },
    202: {
      description: "Approval required",
      content: { "application/json": { schema: apiErrorResponseSchema } },
    },
    400: {
      description: "Validation error",
      content: { "application/json": { schema: apiErrorResponseSchema } },
    },
    401: {
      description: "Unauthorized",
      content: { "application/json": { schema: apiErrorResponseSchema } },
    },
    403: {
      description: "Forbidden",
      content: { "application/json": { schema: apiErrorResponseSchema } },
    },
    404: {
      description: "Tool not found",
      content: { "application/json": { schema: apiErrorResponseSchema } },
    },
  },
});

export function createConcreteToolInvokeRoute(entry: OperationEntry) {
  const inputSchema = entry.inputSchema ?? z.unknown();
  const outputSchema = entry.outputSchema ?? z.unknown();
  return createRoute({
    method: "post",
    path: `/api/tools/${entry.operationId}/invoke`,
    summary: `Invoke ${entry.operationId}`,
    description:
      entry.description ??
      `Invoke the ${entry.operationId} tool through capability gating, policy, approval, audit, and schema validation.`,
    tags: ["Tools"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              input: inputSchema.optional(),
            }),
          },
        },
      },
    },
    responses: {
      ...invokeToolRoute.responses,
      200: {
        description: "Tool result",
        content: {
          "application/json": {
            schema: z.object({
              ok: z.literal(true),
              data: outputSchema,
            }),
          },
        },
      },
    },
  });
}

export function createConcreteModuleToolInvokeRoute(entry: OperationEntry) {
  const inputSchema = entry.inputSchema ?? z.unknown();
  const outputSchema = entry.outputSchema ?? z.unknown();
  return createRoute({
    method: "post",
    path: `/api/${entry.operation.moduleId}/tools/${entry.operationId}/invoke`,
    summary: `Invoke ${entry.operationId} for ${entry.operation.moduleId}`,
    description:
      entry.description ??
      `Invoke the ${entry.operationId} module tool after confirming it belongs to ${entry.operation.moduleId}.`,
    tags: ["Tools"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              input: inputSchema.optional(),
            }),
          },
        },
      },
    },
    responses: {
      ...invokeModuleToolRoute.responses,
      200: {
        description: "Tool result",
        content: {
          "application/json": {
            schema: z.object({
              ok: z.literal(true),
              data: outputSchema,
            }),
          },
        },
      },
    },
  });
}

export const listToolContractsRoute = createRoute({
  method: "get",
  path: "/api/tools/contracts",
  summary: "List tool contracts",
  description:
    "Discover callable tool contracts available to the authenticated principal.",
  tags: ["Tools"],
  responses: listOperationContractsRoute.responses,
});

export const getToolContractRoute = createRoute({
  method: "get",
  path: "/api/tools/contracts/:toolId",
  summary: "Get tool contract",
  description:
    "Fetch one callable tool contract after tenant and capability gating.",
  tags: ["Tools"],
  request: {
    params: z.object({ toolId: z.string() }),
  },
  responses: getOperationContractRoute.responses,
});

export const invokeToolRoute = createRoute({
  method: "post",
  path: "/api/tools/:toolId/invoke",
  summary: "Invoke tool",
  description:
    "Invoke a callable tool through the internal executor, policy, approval, audit, and schema validation.",
  tags: ["Tools"],
  request: {
    params: z.object({ toolId: z.string() }),
    body: invokeOperationRoute.request.body,
  },
  responses: invokeOperationRoute.responses,
});

export const listModuleToolContractsRoute = createRoute({
  method: "get",
  path: "/api/:moduleId/tools",
  summary: "List module tool contracts",
  description:
    "Discover callable tool contracts for one module after tenant and capability gating.",
  tags: ["Tools"],
  request: {
    params: z.object({ moduleId: z.string() }),
  },
  responses: listOperationContractsRoute.responses,
});

export const getModuleToolContractRoute = createRoute({
  method: "get",
  path: "/api/:moduleId/tools/:toolId",
  summary: "Get module tool contract",
  description:
    "Fetch one callable tool contract and reject URL module mismatches before returning it.",
  tags: ["Tools"],
  request: {
    params: z.object({ moduleId: z.string(), toolId: z.string() }),
  },
  responses: getOperationContractRoute.responses,
});

export const invokeModuleToolRoute = createRoute({
  method: "post",
  path: "/api/:moduleId/tools/:toolId/invoke",
  summary: "Invoke module tool",
  description:
    "Invoke a callable tool and reject URL module mismatches before running policy or handler code.",
  tags: ["Tools"],
  request: {
    params: z.object({ moduleId: z.string(), toolId: z.string() }),
    body: invokeOperationRoute.request.body,
  },
  responses: invokeOperationRoute.responses,
});

export class InvokeOperationError extends Error {
  status: number;
  body?: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "InvokeOperationError";
    this.status = status;
    this.body = body;
  }
}

/**
 * The three 403s the pipeline throws carry the same fields, so `kind` is what
 * lets the HTTP adapter rebuild the distinct envelope each one has always
 * produced. In-process callers read `reason`/`diagnostics` and ignore it.
 */
export type ForbiddenBodyKind =
  | "capability_denied"
  | "interceptor_blocked"
  | "policy_denied";

export interface ForbiddenBody {
  diagnostics?: unknown;
  error: "Forbidden";
  kind: ForbiddenBodyKind;
  reason?: string;
}

export function forbiddenBody(
  kind: ForbiddenBodyKind,
  reason: string | undefined,
  diagnostics?: unknown
): ForbiddenBody {
  return {
    error: "Forbidden",
    kind,
    reason,
    ...(diagnostics === undefined ? {} : { diagnostics }),
  };
}

/**
 * Body of the 202 thrown when policy asks a human first. Typed because the MCP
 * lane reads `approvalRequestId` back out to bind its retry to the request that
 * was filed, and the test-data importer passes the whole body through on `ok`.
 */
export interface ApprovalRequiredBody {
  approvalRequestId: string;
  code: "approval_required";
  expiresAt: string;
  ok: false;
  reason: string;
  requiresApproval: boolean;
  riskLevel: string;
  status: "approval_required";
}

export function approvalRequiredBody(params: {
  gate: { approvalRequestId: string; expiresAt: string; reason: string };
  requiresApproval: boolean;
  riskLevel: string;
}): ApprovalRequiredBody {
  return {
    approvalRequestId: params.gate.approvalRequestId,
    code: "approval_required",
    expiresAt: params.gate.expiresAt,
    ok: false,
    reason: params.gate.reason,
    requiresApproval: params.requiresApproval,
    riskLevel: params.riskLevel,
    status: "approval_required",
  };
}

export function isApprovalRequiredBody(
  body: unknown
): body is ApprovalRequiredBody {
  if (typeof body !== "object" || body === null) {
    return false;
  }
  const record = body as Record<string, unknown>;
  return (
    record.code === "approval_required" &&
    typeof record.approvalRequestId === "string"
  );
}

/**
 * Validate a handler result against the operation's declared output schema.
 * A mismatch is the MODULE breaking its own contract, never the caller's
 * fault — so it must surface as a 500 "output_contract_violation", not fall
 * into the generic ZodError → 400 "validation_error" path, which reads as
 * "your input was invalid" and sends whoever debugs it to the wrong layer.
 */
export function parseOperationOutput(
  outputSchema: { parse: (value: unknown) => unknown },
  result: unknown,
  operationId: string
): unknown {
  try {
    return outputSchema.parse(result);
  } catch (e) {
    if (!isZodError(e)) {
      throw e;
    }
    const message = `module operation "${operationId}" returned output that does not match its output schema`;
    throw new InvokeOperationError(message, 500, {
      code: "output_contract_violation",
      message,
      ...(() => {
        const formatted = formatZodErrorForApiError(e);
        return formatted.fields ? { fields: formatted.fields } : {};
      })(),
    });
  }
}
