import { formatZodErrorForApiError, isZodError } from "@engenty/api-contracts";
import type {
  ApprovalDecision,
  createApprovalService,
} from "@engenty/approvals-sdk";
import {
  capabilityCovers,
  isPluginOperationError,
  OPERATION_SPACE_POLICY_KINDS,
  operationSpacePolicySchema,
} from "@engenty/plugin-sdk";
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthUnavailableError } from "../../../dal/core-users/auth.js";
import { resolveSpaceResourceSurface } from "../../../dal/space-mounts.js";
import { findSpaceIdForRecord } from "../../../dal/space-record-lookup.js";
import type { TenantPluginOverridesDal } from "../../../dal/tenant-plugin-overrides.js";
import { resolvePluginCapability } from "../../../plugins/capability-resolver.js";
import type { PluginRegistry } from "../../../plugins/registry.js";
import {
  type ApprovalDecidedEvent,
  emitApprovalRequested,
  fileApprovalRequest,
} from "../../../security/approval-gate.js";
import type { SecurityAuditLogAdapter } from "../../../security/audit-adapter.js";
import { enrichAuditEventsWithUsers } from "../../../security/audit-enrich.js";
import { buildExecutedAuditDetail } from "../../../security/audit-relevance.js";
import {
  recordCoreAuditEvent,
  recordModuleAuditEvent,
} from "../../../security/audit-service.js";
import type { PrincipalContext } from "../../../security/auth.js";
import type { AuthProvider } from "../../../security/auth-provider.js";
import { InProcessPolicyError } from "../../../security/in-process-gate.js";
import {
  evaluatePolicy,
  evaluateResultPolicy,
  type PolicyDeps,
} from "../../../security/policy.js";
import {
  isApprovedEdge,
  linkPrincipal,
} from "../../../security/principal-link.js";
import { buildOperationContracts } from "../../operation-contracts.js";
import { jsonApiError, jsonApiSuccess } from "../api-response.js";
import {
  enforceOperationSpacePolicy,
  type FindRecordSpaceId,
  type IsConnectionMounted,
  prepareOperationSpaceInput,
} from "./module-operation-space-policy.js";

type ApprovalService = ReturnType<typeof createApprovalService>;

type OperationEntry = PluginRegistry["moduleOperations"][number];

const CORE_PLUGIN_ID = "core";

type TenantPluginOverrideResolver = (
  tenantId: string
) => Promise<Record<string, boolean>>;

interface OperationRoutesContext {
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

interface HonoJsonContext {
  json: (body: unknown, status?: number) => Response;
  req: {
    header: (name: string) => string | undefined;
    json: () => Promise<unknown>;
    param: (name: string) => string;
  };
}

interface HonoGetContext {
  json: (body: unknown, status?: number) => Response;
  req: {
    header: (name: string) => string | undefined;
    param: (name: string) => string;
  };
}

type OperationEventName =
  | "operation.afterInvoke"
  | "operation.beforeInvoke"
  | "operation.context"
  | "operation.error";

function operationEventPayload(params: {
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

async function emitCoreOperationEvent(params: {
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

async function runBeforeOperationInterceptors(params: {
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
  throw new InvokeOperationError(decision.reason ?? "Operation blocked", 403, {
    error: "Forbidden",
    reason: decision.reason,
  });
}

async function applyOperationContextFilters(params: {
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

function buildOperationMap(
  registry: PluginRegistry
): Map<string, OperationEntry> {
  const entries = new Map<string, OperationEntry>();
  for (const op of registry.moduleOperations) {
    entries.set(op.operationId, op);
  }
  return entries;
}

function isCoreOwnedOperation(pluginId: string): boolean {
  return pluginId === CORE_PLUGIN_ID;
}

function operationSpacePolicyDeps(
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

async function applyDispatchSpacePolicy(params: {
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

const schemaSummarySchema = z.object({
  type: z.enum(["zod", "none"]),
  hint: z.string().optional(),
});

const operationContractSchema = z.object({
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
  record_scope: z.enum(OPERATION_SPACE_POLICY_KINDS).optional(),
  spacePolicy: operationSpacePolicySchema.optional(),
});

const apiErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    fields: z.record(z.string(), z.array(z.string())).optional(),
  }),
});

const toolInvokeBodySchema = z.object({
  input: z.unknown().optional(),
});

const toolInvokeSuccessSchema = z.object({
  ok: z.literal(true),
  data: z.unknown(),
});

const listOperationContractsRoute = createRoute({
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

const getOperationContractRoute = createRoute({
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

const invokeOperationRoute = createRoute({
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

function createConcreteToolInvokeRoute(entry: OperationEntry) {
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

function createConcreteModuleToolInvokeRoute(entry: OperationEntry) {
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

const listToolContractsRoute = createRoute({
  method: "get",
  path: "/api/tools/contracts",
  summary: "List tool contracts",
  description:
    "Discover callable tool contracts available to the authenticated principal.",
  tags: ["Tools"],
  responses: listOperationContractsRoute.responses,
});

const getToolContractRoute = createRoute({
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

const invokeToolRoute = createRoute({
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

const listModuleToolContractsRoute = createRoute({
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

const getModuleToolContractRoute = createRoute({
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

const invokeModuleToolRoute = createRoute({
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
 * Validate a handler result against the operation's declared output schema.
 * A mismatch is the MODULE breaking its own contract, never the caller's
 * fault — so it must surface as a 500 "output_contract_violation", not fall
 * into the generic ZodError → 400 "validation_error" path, which reads as
 * "your input was invalid" and sends whoever debugs it to the wrong layer.
 */
function parseOperationOutput(
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

/** Invoke a module operation with policy/approval/audit. Use for test-data apply. */
export async function invokeOperation(params: {
  auth: PrincipalContext;
  registry: PluginRegistry;
  config: Record<string, unknown>;
  dataDir: string;
  resolvePath: (p: string) => string;
  operationId: string;
  input: unknown;
  transport?: "gateway" | "http" | "module_ops" | "mcp";
  approvalService: ApprovalService;
  auditLog: SecurityAuditLogAdapter;
  resolveAgentApproval?: PolicyDeps["resolveAgentApproval"];
  resolveTenantPluginOverrides?: TenantPluginOverrideResolver;
}): Promise<{ data: unknown }> {
  const {
    auth,
    registry,
    config,
    dataDir,
    resolvePath,
    operationId,
    input,
    transport = "module_ops",
    approvalService,
    auditLog,
    resolveAgentApproval,
    resolveTenantPluginOverrides,
  } = params;
  const map = buildOperationMap(registry);
  const entry = map.get(operationId);
  if (!entry) {
    throw new InvokeOperationError(
      `Unknown module operation: ${operationId}`,
      404
    );
  }
  const op = entry.operation;
  const moduleId = op.moduleId;
  const tenantPluginOverrides = resolveTenantPluginOverrides
    ? await resolveTenantPluginOverrides(auth.tenantId)
    : {};
  if (!isCoreOwnedOperation(entry.pluginId)) {
    const capability = op.operationId;
    const capabilityResolution = resolvePluginCapability({
      tenantId: auth.tenantId,
      registry,
      pluginId: entry.pluginId,
      capability,
      contributionKind: transport === "mcp" ? "mcp_tool" : "operation",
      registeredCapabilities: registry.moduleOperations
        .filter((item) => item.pluginId === entry.pluginId)
        .map((item) => item.operationId),
      tenantPluginOverrides,
    });
    if (!capabilityResolution.allowed) {
      recordModuleAuditEvent(auditLog, moduleId, {
        type: "capability.deny",
        actorId: auth.principalId,
        tenantId: auth.tenantId,
        moduleId,
        operationId,
        detail: {
          reason: capabilityResolution.reason,
          diagnostics: capabilityResolution.diagnostics,
        },
      });
      throw new InvokeOperationError(capabilityResolution.reason, 403, {
        error: "Forbidden",
        reason: capabilityResolution.reason,
        diagnostics: capabilityResolution.diagnostics,
      });
    }
  }
  const beforePayload = operationEventPayload({
    auth,
    input,
    moduleId,
    operationId,
    transport,
  });
  await runBeforeOperationInterceptors({
    auth,
    auditLog,
    moduleId,
    operationId,
    payload: beforePayload,
    registry,
  });
  await applyOperationContextFilters({
    auth,
    payload: beforePayload,
    registry,
  });
  const decision = await evaluatePolicy(
    {
      auth,
      moduleId,
      operationId: op.operationId,
      requiredCapabilities: op.requiredCapabilities,
      riskLevel: op.riskLevel,
      requiresApproval: op.requiresApproval,
      transport,
      input,
    },
    registry,
    { approvalService, resolveAgentApproval }
  );
  if (decision.action === "deny") {
    recordModuleAuditEvent(auditLog, moduleId, {
      type: "policy.deny",
      actorId: auth.principalId,
      tenantId: auth.tenantId,
      moduleId,
      operationId,
      detail: { reason: decision.reason },
    });
    throw new InvokeOperationError(decision.reason, 403, {
      error: "Forbidden",
      reason: decision.reason,
    });
  }
  if (decision.action === "require_approval") {
    // evaluatePolicy already spent any covering grant — this is a real ask.
    const gate = await fileApprovalRequest({
      approvalService,
      auditLog,
      auth,
      moduleId,
      operationId,
      onRequested: emitApprovalRequested(registry, auth),
      reason: decision.reason,
      ...(decision.approvalContext
        ? { context: decision.approvalContext }
        : {}),
    });
    throw new InvokeOperationError("Approval required", 202, {
      ok: false,
      status: "approval_required",
      code: "approval_required",
      approvalRequestId: gate.approvalRequestId,
      expiresAt: gate.expiresAt,
      reason: gate.reason,
      riskLevel: op.riskLevel,
      requiresApproval: op.requiresApproval,
    });
  }
  const auditRelevance = {
    audit: op.audit,
    operationId,
    requiredCapabilities: op.requiredCapabilities,
    requiresApproval: op.requiresApproval,
    riskLevel: op.riskLevel,
  };
  const recordAuditEvent = (event: {
    type: string;
    detail?: Record<string, unknown>;
    operationId?: string;
  }) => {
    recordModuleAuditEvent(auditLog, moduleId, {
      type: event.type,
      actorId: auth.principalId,
      tenantId: auth.tenantId,
      moduleId,
      operationId: event.operationId ?? operationId,
      detail: event.detail,
    });
  };
  try {
    const parsed = await applyDispatchSpacePolicy({
      auth,
      input,
      parse: (value) =>
        entry.inputSchema ? entry.inputSchema.parse(value) : value,
      policy: op.spacePolicy,
      registry,
    });
    const result = await entry.handler(parsed, {
      config,
      pluginConfig: entry.pluginConfig,
      dataDir,
      resolvePath,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      auth: linkPrincipal(
        {
          tenantId: auth.tenantId,
          scopeId: "default",
          principalId: auth.principalId,
          principalType: auth.principalType,
          capabilities: auth.capabilities,
          // Agent identity (x-engenty-agent-id / x-engenty-goal-id) so handlers
          // can audit the acting agent instead of the impersonated user.
          ...(auth.agentId ? { agentId: auth.agentId } : {}),
          ...(auth.goalId ? { goalId: auth.goalId } : {}),
          // The space the call happens in (CN.3), so a handler that LISTS what a
          // space contains can narrow to it. Filtering only, never widening.
          ...(auth.spaceId ? { spaceId: auth.spaceId } : {}),
          // The routine subject, for handlers that verify a claimed space
          // binding against the routine's stored one (personal-space owner
          // resolution, PLAN-space-computer.md §2.1).
          ...(auth.triggerId ? { triggerId: auth.triggerId } : {}),
        },
        {
          principal: auth,
          approvedEdge: isApprovedEdge({
            action: decision.action,
            requiresApproval: op.requiresApproval,
            riskLevel: op.riskLevel,
          }),
        }
      ),
      recordAuditEvent,
    });
    const validated = entry.outputSchema
      ? parseOperationOutput(entry.outputSchema, result, operationId)
      : result;
    const resultDecision = evaluateResultPolicy(
      {
        auth,
        moduleId,
        operationId: op.operationId,
        requiredCapabilities: op.requiredCapabilities,
        riskLevel: op.riskLevel,
        requiresApproval: op.requiresApproval,
        transport,
        input,
      },
      validated,
      registry
    );
    if (resultDecision?.action === "deny") {
      recordModuleAuditEvent(auditLog, moduleId, {
        type: "operation.rejected",
        actorId: auth.principalId,
        tenantId: auth.tenantId,
        moduleId,
        operationId,
        detail: { reason: resultDecision.reason },
      });
      throw new InvokeOperationError(resultDecision.reason, 403, {
        error: "Forbidden",
        reason: resultDecision.reason,
      });
    }
    recordModuleAuditEvent(
      auditLog,
      moduleId,
      {
        type: "operation.executed",
        actorId: auth.principalId,
        tenantId: auth.tenantId,
        moduleId,
        operationId,
        detail: buildExecutedAuditDetail({
          transport,
          riskLevel: op.riskLevel,
          principalType: auth.principalType,
          agentId: auth.agentId,
          goalId: auth.goalId,
        }),
      },
      undefined,
      auditRelevance
    );
    await emitCoreOperationEvent({
      auth,
      eventName: "operation.afterInvoke",
      payload: operationEventPayload({
        auth,
        input,
        moduleId,
        op,
        operationId,
        result: validated,
        transport,
      }),
      registry,
    });
    return { data: validated };
  } catch (e) {
    await emitCoreOperationEvent({
      auth,
      eventName: "operation.error",
      payload: {
        ...operationEventPayload({
          auth,
          input,
          moduleId,
          operationId,
          transport,
        }),
        error: e instanceof Error ? e.message : String(e),
      },
      registry,
    });
    if (e instanceof InProcessPolicyError) {
      throw inProcessPolicyHttpError(e);
    }
    if (isZodError(e)) {
      throw new InvokeOperationError(
        e.message,
        400,
        formatZodErrorForApiError(e)
      );
    }
    // A handler that knows the answer says so. Everything else still falls
    // through to 500, which is what an unrecognised throw genuinely is — this
    // only stops "no such connection" from being reported as a server fault to
    // the client, the retry policy and the alerting alike.
    if (isPluginOperationError(e)) {
      throw new InvokeOperationError(e.message, e.status, {
        code: e.code,
        message: e.message,
        ...(e.details ? { details: e.details } : {}),
      });
    }
    throw e;
  }
}

/**
 * A nested in-process call the gate refused is an authorization answer, not a
 * crash: 403 with the reason, the same shape the outer edges give. Handlers
 * that treat the nested call as optional catch it themselves and never reach
 * here; the ones that don't get a status a client can act on.
 */
function inProcessPolicyHttpError(e: InProcessPolicyError) {
  return new InvokeOperationError(e.message, 403, {
    code: "in_process_policy_denied",
    message: e.message,
    error: "Forbidden",
    reason: e.reason,
    operationId: e.operationId,
  });
}

async function requireAuth(
  c: {
    req: { header: (name: string) => string | undefined };
    json: (body: unknown, status?: number) => Response;
  },
  authProvider: AuthProvider
) {
  let resolved: Awaited<ReturnType<typeof authProvider.resolvePrincipal>>;
  try {
    resolved = await authProvider.resolvePrincipal(
      c.req.header("authorization")
    );
  } catch (error) {
    if (error instanceof AuthUnavailableError) {
      // The session could not be checked (auth server down/slow) — 503, not
      // 401. See AuthUnavailableError for why this distinction matters.
      return {
        error: jsonApiError(c, 503, {
          message: "Authentication service unavailable — please retry.",
        }),
        auth: null,
      };
    }
    throw error;
  }
  if (!resolved) {
    return {
      error: jsonApiError(c, 401, { message: "Unauthorized" }),
      auth: null,
    };
  }
  // Phase 4: surface the driving agent + goal so the escalation policy can
  // gate the band above the agent's grants. For an agent token the agent id IS
  // the principal; for chat act-as-user, apps/ai forwards it via headers. These
  // only ever ADD an approval requirement (never widen) — the token's own
  // capabilities remain the hard ceiling, checked upstream.
  const headerAgentId = c.req.header("x-engenty-agent-id");
  const headerGoalId = c.req.header("x-engenty-goal-id");
  const headerTaskId = c.req.header("x-engenty-task-id");
  const headerTriggerId = c.req.header("x-engenty-trigger-id");
  // CON-01: an engenty App drives core with the VIEWING USER's token, so every
  // policy that reads `principalType` sees an ordinary interactive user — and
  // the connections gate then stands aside for the AI pre-gate that, outside
  // chat, is not there. The App proxy marks its own calls; policies use it to
  // treat them as autonomous. Only ever ADDS an approval requirement, and only
  // the value "app" is recognised, so a forged header cannot widen anything.
  const headerOrigin = c.req.header("x-engenty-call-origin");
  // CN.3: the space the run is in, so a policy can intersect what the principal
  // may reach with what the space mounts. Taken on trust for the same reason as
  // the ids above — it only ever NARROWS. A caller naming a space they are not
  // in removes candidates from their own set; it cannot add one, because
  // sharing, capabilities and the connection's own policy still decide what is
  // in that set to begin with.
  const headerSpaceId = c.req.header("x-engenty-space-id")?.trim();
  const auth = {
    ...resolved,
    ...(headerSpaceId ? { spaceId: headerSpaceId } : {}),
    agentId:
      resolved.principalType === "agent"
        ? resolved.principalId
        : (headerAgentId ?? resolved.agentId),
    ...(headerOrigin === "app" ? { callOrigin: "app" as const } : {}),
    goalId: headerGoalId ?? resolved.goalId,
    // Task/trigger the headless run is executing — subjects for task- and
    // routine-scoped approval grants, and (task) the link that lets an
    // approval resume the blocked task.
    taskId: headerTaskId ?? resolved.taskId,
    triggerId: headerTriggerId ?? resolved.triggerId,
  };
  return { error: null, auth };
}

/** Auth for audit API: engenty JWT or Supabase session (for UI users). */
async function requireAuthForAudit(
  c: {
    req: {
      header: (name: string) => string | undefined;
      query: (key: string) => string | undefined;
    };
    json: (body: unknown, status?: number) => Response;
  },
  authProvider: AuthProvider
): Promise<
  | { error: Response; auth: null }
  | { error: null; auth: { tenantId: string | null } }
> {
  const tenantId = await authProvider.resolveTenantForSession(
    c.req.header("authorization")
  );
  if (!tenantId) {
    return {
      error: jsonApiError(c, 401, { message: "Unauthorized" }),
      auth: null,
    };
  }
  return { error: null, auth: { tenantId } };
}

async function listAvailableOperationContracts(
  c: HonoGetContext,
  params: OperationRoutesContext & { moduleId?: string }
) {
  const authResult = await requireAuth(c, params.authProvider);
  if (authResult.error || !authResult.auth) {
    return authResult.error!;
  }
  const tenantPluginOverrides = params.resolveTenantPluginOverrides
    ? await params.resolveTenantPluginOverrides(authResult.auth.tenantId)
    : {};
  const contracts = buildOperationContracts(params.registry).filter(
    (contract) =>
      (params.moduleId ? contract.moduleId === params.moduleId : true) &&
      (isCoreOwnedOperation(contract.pluginId) ||
        resolvePluginCapability({
          tenantId: authResult.auth.tenantId,
          registry: params.registry,
          pluginId: contract.pluginId,
          capability: contract.operationId,
          contributionKind: "operation",
          registeredCapabilities: params.registry.moduleOperations
            .filter((item) => item.pluginId === contract.pluginId)
            .map((item) => item.operationId),
          tenantPluginOverrides,
        }).allowed)
  );
  return jsonApiSuccess(c, contracts);
}

async function getAvailableOperationContract(
  c: HonoGetContext,
  params: OperationRoutesContext & {
    moduleId?: string;
    operationId: string;
    publicName: "Operation" | "Tool";
  }
) {
  const authResult = await requireAuth(c, params.authProvider);
  if (authResult.error || !authResult.auth) {
    return authResult.error!;
  }
  const contract = buildOperationContracts(params.registry).find(
    (item) => item.operationId === params.operationId
  );
  if (!contract) {
    return jsonApiError(c, 404, {
      message: `${params.publicName} contract not found`,
    });
  }
  if (params.moduleId && contract.moduleId !== params.moduleId) {
    return jsonApiError(c, 404, {
      message: `${params.publicName} contract not found for module`,
      details: {
        moduleId: params.moduleId,
        toolId: params.operationId,
      },
    });
  }
  const tenantPluginOverrides = params.resolveTenantPluginOverrides
    ? await params.resolveTenantPluginOverrides(authResult.auth.tenantId)
    : {};
  if (!isCoreOwnedOperation(contract.pluginId)) {
    const capabilityResolution = resolvePluginCapability({
      tenantId: authResult.auth.tenantId,
      registry: params.registry,
      pluginId: contract.pluginId,
      capability: contract.operationId,
      contributionKind: "operation",
      registeredCapabilities: params.registry.moduleOperations
        .filter((item) => item.pluginId === contract.pluginId)
        .map((item) => item.operationId),
      tenantPluginOverrides,
    });
    if (!capabilityResolution.allowed) {
      return jsonApiError(c, 403, {
        code: capabilityResolution.reason,
        message: `${params.publicName} contract unavailable`,
        details: {
          reason: capabilityResolution.reason,
          diagnostics: capabilityResolution.diagnostics,
        },
      });
    }
  }
  return jsonApiSuccess(c, contract);
}

async function invokeOperationFromRoute(
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
  transport?: "gateway" | "http" | "module_ops" | "mcp";
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
  const auth = authResult.auth;

  const map = buildOperationMap(params.registry);
  const entry = map.get(params.operationId);
  if (!entry) {
    return jsonApiError(params.c, 404, {
      message: `Unknown module operation: ${params.operationId}`,
    });
  }

  const op = entry.operation;
  const moduleId = op.moduleId;
  const transport = params.transport ?? "module_ops";
  const tenantPluginOverrides = params.resolveTenantPluginOverrides
    ? await params.resolveTenantPluginOverrides(auth.tenantId)
    : {};
  if (!isCoreOwnedOperation(entry.pluginId)) {
    const capability = op.operationId;
    const capabilityResolution = resolvePluginCapability({
      tenantId: auth.tenantId,
      registry: params.registry,
      pluginId: entry.pluginId,
      capability,
      contributionKind: transport === "mcp" ? "mcp_tool" : "operation",
      registeredCapabilities: params.registry.moduleOperations
        .filter((item) => item.pluginId === entry.pluginId)
        .map((item) => item.operationId),
      tenantPluginOverrides,
    });
    if (!capabilityResolution.allowed) {
      recordModuleAuditEvent(params.auditLog, moduleId, {
        type: "capability.deny",
        actorId: auth.principalId,
        tenantId: auth.tenantId,
        moduleId,
        operationId: params.operationId,
        detail: {
          reason: capabilityResolution.reason,
          diagnostics: capabilityResolution.diagnostics,
        },
      });
      return jsonApiError(params.c, 403, {
        code: capabilityResolution.reason,
        message: "Capability unavailable",
        details: {
          reason: capabilityResolution.reason,
          diagnostics: capabilityResolution.diagnostics,
        },
      });
    }
  }
  const beforePayload = operationEventPayload({
    auth,
    input: params.input,
    moduleId,
    operationId: params.operationId,
    transport,
  });
  try {
    await runBeforeOperationInterceptors({
      auth,
      auditLog: params.auditLog,
      moduleId,
      operationId: params.operationId,
      payload: beforePayload,
      registry: params.registry,
    });
    await applyOperationContextFilters({
      auth,
      payload: beforePayload,
      registry: params.registry,
    });
  } catch (e) {
    // A typed handler error that reached here without being translated — the
    // in-process lane rethrows before `runHandler`'s catch. Same answer either
    // way, so the code and status the module chose are not lost to whichever
    // path the call happened to take.
    if (isPluginOperationError(e)) {
      return jsonApiError(params.c, e.status, {
        code: e.code,
        message: e.message,
        ...(e.details ? { details: e.details } : {}),
      });
    }
    if (e instanceof InvokeOperationError) {
      // `body` is `unknown` and the shapes thrown here (e.g. the interceptor
      // block's `{ error, reason }`) carry no `message` — passing it straight
      // through produced an error envelope with `message: undefined`. Take
      // what is there and always answer with a message.
      const eBody = e.body as Record<string, unknown> | undefined;
      return jsonApiError(params.c, e.status, {
        ...(typeof eBody?.code === "string" ? { code: eBody.code } : {}),
        ...(eBody === undefined ? {} : { details: eBody }),
        message: typeof eBody?.message === "string" ? eBody.message : e.message,
      });
    }
    throw e;
  }
  const decision = await evaluatePolicy(
    {
      auth,
      moduleId,
      operationId: op.operationId,
      requiredCapabilities: op.requiredCapabilities,
      riskLevel: op.riskLevel,
      requiresApproval: op.requiresApproval,
      transport,
      input: params.input,
    },
    params.registry,
    {
      approvalService: params.approvalService,
      resolveAgentApproval: params.resolveAgentApproval,
    }
  );
  if (decision.action === "deny") {
    recordModuleAuditEvent(params.auditLog, moduleId, {
      type: "policy.deny",
      actorId: auth.principalId,
      tenantId: auth.tenantId,
      moduleId,
      operationId: params.operationId,
      detail: { reason: decision.reason },
    });
    return jsonApiError(params.c, 403, {
      message: "Forbidden",
      details: { reason: decision.reason },
    });
  }

  if (decision.action === "require_approval") {
    // evaluatePolicy already spent any covering grant — this is a real ask.
    const gate = await fileApprovalRequest({
      approvalService: params.approvalService,
      auditLog: params.auditLog,
      auth,
      moduleId,
      operationId: params.operationId,
      onRequested: emitApprovalRequested(params.registry, auth),
      reason: decision.reason,
      ...(decision.approvalContext
        ? { context: decision.approvalContext }
        : {}),
    });
    return jsonApiError(params.c, 202, {
      code: "approval_required",
      message: "Approval required",
      details: {
        approvalRequestId: gate.approvalRequestId,
        expiresAt: gate.expiresAt,
        reason: gate.reason,
        riskLevel: op.riskLevel,
        requiresApproval: op.requiresApproval,
      },
    });
  }

  const auditRelevance = {
    audit: op.audit,
    operationId: params.operationId,
    requiredCapabilities: op.requiredCapabilities,
    requiresApproval: op.requiresApproval,
    riskLevel: op.riskLevel,
  };

  const recordAuditEvent = (event: {
    type: string;
    detail?: Record<string, unknown>;
    operationId?: string;
  }) => {
    recordModuleAuditEvent(params.auditLog, moduleId, {
      type: event.type,
      actorId: auth.principalId,
      tenantId: auth.tenantId,
      moduleId,
      operationId: event.operationId ?? params.operationId,
      detail: event.detail,
    });
  };

  try {
    const parsed = await applyDispatchSpacePolicy({
      auth,
      input: params.input,
      parse: (value) =>
        entry.inputSchema ? entry.inputSchema.parse(value) : value,
      policy: op.spacePolicy,
      registry: params.registry,
    });
    const result = await entry.handler(parsed, {
      config: params.config,
      pluginConfig: entry.pluginConfig,
      dataDir: params.dataDir,
      resolvePath: params.resolvePath,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      auth: linkPrincipal(
        {
          tenantId: auth.tenantId,
          scopeId: "default",
          principalId: auth.principalId,
          principalType: auth.principalType,
          capabilities: auth.capabilities,
          // Agent identity (x-engenty-agent-id / x-engenty-goal-id) so handlers
          // can audit the acting agent instead of the impersonated user.
          ...(auth.agentId ? { agentId: auth.agentId } : {}),
          ...(auth.goalId ? { goalId: auth.goalId } : {}),
          // The space the call happens in (CN.3), so a handler that LISTS what a
          // space contains can narrow to it. Filtering only, never widening.
          ...(auth.spaceId ? { spaceId: auth.spaceId } : {}),
          // The routine subject, for handlers that verify a claimed space
          // binding against the routine's stored one (personal-space owner
          // resolution, PLAN-space-computer.md §2.1).
          ...(auth.triggerId ? { triggerId: auth.triggerId } : {}),
        },
        {
          principal: auth,
          approvedEdge: isApprovedEdge({
            action: decision.action,
            requiresApproval: op.requiresApproval,
            riskLevel: op.riskLevel,
          }),
        }
      ),
      recordAuditEvent,
    });
    const validated = entry.outputSchema
      ? parseOperationOutput(entry.outputSchema, result, params.operationId)
      : result;
    const resultDecision = evaluateResultPolicy(
      {
        auth,
        moduleId,
        operationId: op.operationId,
        requiredCapabilities: op.requiredCapabilities,
        riskLevel: op.riskLevel,
        requiresApproval: op.requiresApproval,
        transport,
        input: params.input,
      },
      validated,
      params.registry
    );
    if (resultDecision?.action === "deny") {
      recordModuleAuditEvent(params.auditLog, moduleId, {
        type: "operation.rejected",
        actorId: auth.principalId,
        tenantId: auth.tenantId,
        moduleId,
        operationId: params.operationId,
        detail: { reason: resultDecision.reason },
      });
      return jsonApiError(params.c, 403, {
        message: "Forbidden",
        details: { reason: resultDecision.reason },
      });
    }
    recordModuleAuditEvent(
      params.auditLog,
      moduleId,
      {
        type: "operation.executed",
        actorId: auth.principalId,
        tenantId: auth.tenantId,
        moduleId,
        operationId: params.operationId,
        detail: buildExecutedAuditDetail({
          transport,
          riskLevel: op.riskLevel,
          principalType: auth.principalType,
          agentId: auth.agentId,
          goalId: auth.goalId,
        }),
      },
      undefined,
      auditRelevance
    );
    await emitCoreOperationEvent({
      auth,
      eventName: "operation.afterInvoke",
      payload: operationEventPayload({
        auth,
        input: params.input,
        moduleId,
        op,
        operationId: params.operationId,
        result: validated,
        transport,
      }),
      registry: params.registry,
    });
    return jsonApiSuccess(params.c, validated);
  } catch (e) {
    await emitCoreOperationEvent({
      auth,
      eventName: "operation.error",
      payload: {
        ...operationEventPayload({
          auth,
          input: params.input,
          moduleId,
          operationId: params.operationId,
          transport,
        }),
        error: e instanceof Error ? e.message : String(e),
      },
      registry: params.registry,
    });
    if (e instanceof InProcessPolicyError) {
      const denied = inProcessPolicyHttpError(e);
      return jsonApiError(params.c, 403, {
        code: "in_process_policy_denied",
        message: denied.message,
        details: { reason: e.reason, operationId: e.operationId },
      });
    }
    if (isPluginOperationError(e)) {
      return jsonApiError(params.c, e.status, {
        code: e.code,
        message: e.message,
        ...(e.details ? { details: e.details } : {}),
      });
    }
    if (e instanceof InvokeOperationError) {
      const body = e.body as
        | { code?: string; fields?: Record<string, string[]> }
        | undefined;
      return jsonApiError(params.c, e.status, {
        message: e.message,
        ...(typeof body?.code === "string" ? { code: body.code } : {}),
        ...(body?.fields ? { fields: body.fields } : {}),
      });
    }
    if (isZodError(e)) {
      return jsonApiError(params.c, 400, formatZodErrorForApiError(e));
    }
    throw e;
  }
}

export function registerModuleOperationRoutes(params: {
  app: OpenAPIHono;
  registry: PluginRegistry;
  config: Record<string, unknown>;
  dataDir: string;
  resolvePath: (p: string) => string;
  authProvider: AuthProvider;
  approvalService: ApprovalService;
  auditLog: SecurityAuditLogAdapter;
  tenantPluginOverrides?: TenantPluginOverridesDal;
  resolveAgentApproval?: PolicyDeps["resolveAgentApproval"];
}) {
  const resolveTenantPluginOverrides = params.tenantPluginOverrides
    ? (tenantId: string) => params.tenantPluginOverrides!.getOverrides(tenantId)
    : undefined;
  const context: OperationRoutesContext = {
    registry: params.registry,
    config: params.config,
    dataDir: params.dataDir,
    resolvePath: params.resolvePath,
    authProvider: params.authProvider,
    approvalService: params.approvalService,
    auditLog: params.auditLog,
    resolveTenantPluginOverrides,
    ...(params.resolveAgentApproval
      ? { resolveAgentApproval: params.resolveAgentApproval }
      : {}),
  };

  params.app.openapi(
    listOperationContractsRoute,
    async (c) => listAvailableOperationContracts(c, context) as never
  );

  params.app.openapi(
    getOperationContractRoute,
    async (c) =>
      getAvailableOperationContract(c, {
        ...context,
        operationId: c.req.param("operationId"),
        publicName: "Operation",
      }) as never
  );

  params.app.openapi(
    invokeOperationRoute,
    async (c) =>
      invokeOperationFromRoute(c, {
        ...context,
        operationId: c.req.param("operationId"),
        publicName: "operation",
      }) as never
  );

  params.app.openapi(
    listToolContractsRoute,
    async (c) => listAvailableOperationContracts(c, context) as never
  );

  params.app.openapi(
    getToolContractRoute,
    async (c) =>
      getAvailableOperationContract(c, {
        ...context,
        operationId: c.req.param("toolId"),
        publicName: "Tool",
      }) as never
  );

  params.app.openapi(
    invokeToolRoute,
    async (c) =>
      invokeOperationFromRoute(c, {
        ...context,
        operationId: c.req.param("toolId"),
        publicName: "tool",
      }) as never
  );

  for (const entry of params.registry.moduleOperations) {
    params.app.openapi(
      createConcreteToolInvokeRoute(entry),
      async (c) =>
        invokeOperationFromRoute(c, {
          ...context,
          operationId: entry.operationId,
          publicName: "tool",
        }) as never
    );
  }

  params.app.get("/api/mcp/tools", async (c) => {
    const authResult = await requireAuth(c, params.authProvider);
    if (authResult.error || !authResult.auth) {
      return authResult.error!;
    }
    const tenantPluginOverrides = resolveTenantPluginOverrides
      ? await resolveTenantPluginOverrides(authResult.auth.tenantId)
      : {};
    const tools = buildOperationContracts(params.registry)
      .filter(
        (contract) =>
          resolvePluginCapability({
            tenantId: authResult.auth.tenantId,
            registry: params.registry,
            pluginId: contract.pluginId,
            capability: contract.operationId,
            contributionKind: "mcp_tool",
            registeredCapabilities: params.registry.moduleOperations
              .filter((item) => item.pluginId === contract.pluginId)
              .map((item) => item.operationId),
            tenantPluginOverrides,
          }).allowed
      )
      .map((contract) => ({
        name: contract.operationId,
        description:
          contract.description ?? `${contract.pluginId} module operation`,
        inputSchema: contract.inputSchema,
        requiredCapabilities: contract.auth.requiredCapabilities,
        riskLevel: contract.auth.riskLevel,
        requiresApproval: contract.auth.requiresApproval,
      }));
    return jsonApiSuccess(c, tools);
  });

  params.app.post("/api/mcp/tools/:operationId/call", async (c) => {
    const operationId = c.req.param("operationId");
    const body = (await c.req.json().catch(() => ({}))) as {
      arguments?: unknown;
    };
    return executeModuleOperation({
      c,
      registry: params.registry,
      config: params.config,
      dataDir: params.dataDir,
      resolvePath: params.resolvePath,
      operationId,
      input: body.arguments ?? {},
      transport: "mcp",
      authProvider: params.authProvider,
      approvalService: params.approvalService,
      auditLog: params.auditLog,
      resolveTenantPluginOverrides,
      ...(params.resolveAgentApproval
        ? { resolveAgentApproval: params.resolveAgentApproval }
        : {}),
    });
  });

  params.app.openapi(
    listModuleToolContractsRoute,
    async (c) =>
      listAvailableOperationContracts(c, {
        ...context,
        moduleId: c.req.param("moduleId"),
      }) as never
  );

  params.app.openapi(
    getModuleToolContractRoute,
    async (c) =>
      getAvailableOperationContract(c, {
        ...context,
        moduleId: c.req.param("moduleId"),
        operationId: c.req.param("toolId"),
        publicName: "Tool",
      }) as never
  );

  params.app.openapi(
    invokeModuleToolRoute,
    async (c) =>
      invokeOperationFromRoute(c, {
        ...context,
        moduleId: c.req.param("moduleId"),
        operationId: c.req.param("toolId"),
        publicName: "tool",
      }) as never
  );

  for (const entry of params.registry.moduleOperations) {
    params.app.openapi(
      createConcreteModuleToolInvokeRoute(entry),
      async (c) =>
        invokeOperationFromRoute(c, {
          ...context,
          moduleId: entry.operation.moduleId,
          operationId: entry.operationId,
          publicName: "tool",
        }) as never
    );
  }
}

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
