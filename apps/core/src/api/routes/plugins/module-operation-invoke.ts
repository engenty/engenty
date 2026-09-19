/**
 * The one execution path for module operations: capability gate, interceptors,
 * policy, approval, space policy, handler, result policy, audit, events.
 *
 * Failures leave as `InvokeOperationError`. In-process callers catch it and the
 * HTTP routes turn it into a response in `module-operation-invoke-http.ts`.
 * There used to be a second copy of this pipeline that built HTTP responses
 * inline. The two drifted — different catch order, only one translating a
 * module's typed errors, two spellings of the approval body — and the MCP
 * retry ended up reading an approval id the other copy never sent. A gate that
 * decides who may act is not a thing to keep two copies of.
 */
import { formatZodErrorForApiError, isZodError } from "@engenty/api-contracts";
import type { createApprovalService } from "@engenty/approvals-sdk";
import { isPluginOperationError } from "@engenty/plugin-sdk";
import { resolvePluginCapability } from "../../../plugins/capability-resolver.js";
import type { PluginRegistry } from "../../../plugins/registry.js";
import {
  emitApprovalRequested,
  fileApprovalRequest,
} from "../../../security/approval-gate.js";
import type { SecurityAuditLogAdapter } from "../../../security/audit-adapter.js";
import { buildExecutedAuditDetail } from "../../../security/audit-relevance.js";
import { recordModuleAuditEvent } from "../../../security/audit-service.js";
import type { PrincipalContext } from "../../../security/auth.js";
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
import {
  applyDispatchSpacePolicy,
  applyOperationContextFilters,
  approvalRequiredBody,
  buildOperationMap,
  emitCoreOperationEvent,
  forbiddenBody,
  InvokeOperationError,
  isCoreOwnedOperation,
  type OperationEntry,
  operationEventPayload,
  parseOperationOutput,
  runBeforeOperationInterceptors,
  type TenantPluginOverrideResolver,
} from "./module-operation-shared.js";

type ApprovalService = ReturnType<typeof createApprovalService>;

export type OperationTransport = "gateway" | "http" | "module_ops" | "mcp";

export interface InvokeOperationParams {
  approvalService: ApprovalService;
  auditLog: SecurityAuditLogAdapter;
  auth: PrincipalContext;
  config: Record<string, unknown>;
  dataDir: string;
  input: unknown;
  operationId: string;
  registry: PluginRegistry;
  resolveAgentApproval?: PolicyDeps["resolveAgentApproval"];
  resolvePath: (p: string) => string;
  resolveTenantPluginOverrides?: TenantPluginOverrideResolver;
  transport?: OperationTransport;
}

/**
 * A nested in-process call the gate refused is an authorization answer, not a
 * crash: 403 with the reason. Handlers that treat the nested call as optional
 * catch it themselves and never reach here; the ones that don't get a status a
 * client can act on.
 */
function inProcessPolicyDenied(e: InProcessPolicyError): InvokeOperationError {
  return new InvokeOperationError(e.message, 403, {
    code: "in_process_policy_denied",
    error: "Forbidden",
    message: e.message,
    operationId: e.operationId,
    reason: e.reason,
  });
}

/**
 * A handler that knows the answer says so. Everything else still falls through
 * unchanged, which is what an unrecognised throw genuinely is — this only stops
 * "no such connection" from being reported as a server fault, to the client and
 * to the retry policy and alerting alike.
 */
function translatePluginError(e: unknown): unknown {
  if (!isPluginOperationError(e)) {
    return e;
  }
  return new InvokeOperationError(e.message, e.status, {
    code: e.code,
    message: e.message,
    ...(e.details ? { details: e.details } : {}),
  });
}

/** Audit the denial, then answer 403, for a plugin the tenant may not call. */
function assertOperationCapability(params: {
  auditLog: SecurityAuditLogAdapter;
  auth: PrincipalContext;
  entry: OperationEntry;
  operationId: string;
  registry: PluginRegistry;
  tenantPluginOverrides: Record<string, boolean>;
  transport: OperationTransport;
}): void {
  const { auth, entry, registry } = params;
  if (isCoreOwnedOperation(entry.pluginId)) {
    return;
  }
  const moduleId = entry.operation.moduleId;
  const resolution = resolvePluginCapability({
    capability: entry.operation.operationId,
    contributionKind: params.transport === "mcp" ? "mcp_tool" : "operation",
    pluginId: entry.pluginId,
    registeredCapabilities: registry.moduleOperations
      .filter((item) => item.pluginId === entry.pluginId)
      .map((item) => item.operationId),
    registry,
    tenantId: auth.tenantId,
    tenantPluginOverrides: params.tenantPluginOverrides,
  });
  if (resolution.allowed) {
    return;
  }
  recordModuleAuditEvent(params.auditLog, moduleId, {
    actorId: auth.principalId,
    detail: {
      diagnostics: resolution.diagnostics,
      reason: resolution.reason,
    },
    moduleId,
    operationId: params.operationId,
    tenantId: auth.tenantId,
    type: "capability.deny",
  });
  throw new InvokeOperationError(
    resolution.reason,
    403,
    forbiddenBody(
      "capability_denied",
      resolution.reason,
      resolution.diagnostics
    )
  );
}

/**
 * The principal a handler runs as, carrying only ids that narrow its reach.
 * Shared by module operations and plugin HTTP routes so a header like
 * `x-engenty-space-id` cannot be kept on one edge and dropped on the other
 * (`scope=space` notification lists came back empty when HTTP dropped it).
 */
export function handlerAuth(
  auth: PrincipalContext,
  approvedEdge: boolean,
  scopeId = "default"
) {
  return linkPrincipal(
    {
      capabilities: auth.capabilities,
      principalId: auth.principalId,
      principalType: auth.principalType,
      scopeId,
      tenantId: auth.tenantId,
      // Agent identity (x-engenty-agent-id / x-engenty-goal-id) so handlers
      // can audit the acting agent instead of the impersonated user.
      ...(auth.agentId ? { agentId: auth.agentId } : {}),
      ...(auth.goalId ? { goalId: auth.goalId } : {}),
      // The space the call happens in (CN.3), so a handler that LISTS what a
      // space contains can narrow to it. Filtering only, never widening.
      ...(auth.spaceId ? { spaceId: auth.spaceId } : {}),
      // The routine subject, for handlers that verify a claimed space binding
      // against the routine's stored one (personal-space owner resolution,
      // PLAN-space-computer.md §2.1).
      ...(auth.triggerId ? { triggerId: auth.triggerId } : {}),
    },
    { approvedEdge, principal: auth }
  );
}

/** Invoke a module operation with policy/approval/audit. */
export async function invokeOperation(
  params: InvokeOperationParams
): Promise<{ data: unknown }> {
  const {
    approvalService,
    auditLog,
    auth,
    config,
    dataDir,
    input,
    operationId,
    registry,
    resolveAgentApproval,
    resolvePath,
    resolveTenantPluginOverrides,
    transport = "module_ops",
  } = params;
  const entry = buildOperationMap(registry).get(operationId);
  if (!entry) {
    throw new InvokeOperationError(
      `Unknown module operation: ${operationId}`,
      404
    );
  }
  const op = entry.operation;
  const moduleId = op.moduleId;
  assertOperationCapability({
    auditLog,
    auth,
    entry,
    operationId,
    registry,
    tenantPluginOverrides: resolveTenantPluginOverrides
      ? await resolveTenantPluginOverrides(auth.tenantId)
      : {},
    transport,
  });
  const beforePayload = operationEventPayload({
    auth,
    input,
    moduleId,
    operationId,
    transport,
  });
  try {
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
  } catch (e) {
    // These stages sit outside the catch below, so a module's typed error
    // thrown from an interceptor or a context filter reached the caller raw.
    throw translatePluginError(e);
  }
  const decision = await evaluatePolicy(
    {
      auth,
      input,
      moduleId,
      operationId: op.operationId,
      requiredCapabilities: op.requiredCapabilities,
      requiresApproval: op.requiresApproval,
      riskLevel: op.riskLevel,
      transport,
    },
    registry,
    { approvalService, resolveAgentApproval }
  );
  if (decision.action === "deny") {
    recordModuleAuditEvent(auditLog, moduleId, {
      actorId: auth.principalId,
      detail: { reason: decision.reason },
      moduleId,
      operationId,
      tenantId: auth.tenantId,
      type: "policy.deny",
    });
    throw new InvokeOperationError(
      decision.reason,
      403,
      forbiddenBody("policy_denied", decision.reason)
    );
  }
  // Space and row-scope constraints are hard authorization boundaries. Check
  // them after capability denial (which must not become an input-validation
  // oracle), but before policy can file an approval.
  let parsed: unknown;
  try {
    parsed = await applyDispatchSpacePolicy({
      auth,
      input,
      parse: (value) =>
        entry.inputSchema ? entry.inputSchema.parse(value) : value,
      policy: op.spacePolicy,
      registry,
    });
  } catch (error) {
    throw translatePluginError(error);
  }
  if (decision.action === "require_approval") {
    // evaluatePolicy already spent any covering grant — this is a real ask.
    const gate = await fileApprovalRequest({
      approvalService,
      auditLog,
      auth,
      moduleId,
      onRequested: emitApprovalRequested(registry, auth),
      operationId,
      reason: decision.reason,
      ...(decision.approvalContext
        ? { context: decision.approvalContext }
        : {}),
    });
    throw new InvokeOperationError(
      "Approval required",
      202,
      approvalRequiredBody({
        gate,
        requiresApproval: op.requiresApproval,
        riskLevel: op.riskLevel,
      })
    );
  }
  const recordAuditEvent = (event: {
    type: string;
    detail?: Record<string, unknown>;
    operationId?: string;
  }) => {
    recordModuleAuditEvent(auditLog, moduleId, {
      actorId: auth.principalId,
      detail: event.detail,
      moduleId,
      operationId: event.operationId ?? operationId,
      tenantId: auth.tenantId,
      type: event.type,
    });
  };
  try {
    const result = await entry.handler(parsed, {
      auth: handlerAuth(
        auth,
        isApprovedEdge({
          action: decision.action,
          requiresApproval: op.requiresApproval,
          riskLevel: op.riskLevel,
        })
      ),
      config,
      dataDir,
      logger: {
        debug: () => {},
        error: () => {},
        info: () => {},
        warn: () => {},
      },
      pluginConfig: entry.pluginConfig,
      recordAuditEvent,
      resolvePath,
    });
    const validated = entry.outputSchema
      ? parseOperationOutput(entry.outputSchema, result, operationId)
      : result;
    const resultDecision = evaluateResultPolicy(
      {
        auth,
        input,
        moduleId,
        operationId: op.operationId,
        requiredCapabilities: op.requiredCapabilities,
        requiresApproval: op.requiresApproval,
        riskLevel: op.riskLevel,
        transport,
      },
      validated,
      registry
    );
    if (resultDecision?.action === "deny") {
      recordModuleAuditEvent(auditLog, moduleId, {
        actorId: auth.principalId,
        detail: { reason: resultDecision.reason },
        moduleId,
        operationId,
        tenantId: auth.tenantId,
        type: "operation.rejected",
      });
      throw new InvokeOperationError(
        resultDecision.reason,
        403,
        forbiddenBody("policy_denied", resultDecision.reason)
      );
    }
    recordModuleAuditEvent(
      auditLog,
      moduleId,
      {
        actorId: auth.principalId,
        detail: buildExecutedAuditDetail({
          agentId: auth.agentId,
          goalId: auth.goalId,
          principalType: auth.principalType,
          riskLevel: op.riskLevel,
          transport,
        }),
        moduleId,
        operationId,
        tenantId: auth.tenantId,
        type: "operation.executed",
      },
      undefined,
      {
        audit: op.audit,
        operationId,
        requiredCapabilities: op.requiredCapabilities,
        requiresApproval: op.requiresApproval,
        riskLevel: op.riskLevel,
      }
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
      throw inProcessPolicyDenied(e);
    }
    if (isZodError(e)) {
      throw new InvokeOperationError(
        e.message,
        400,
        formatZodErrorForApiError(e)
      );
    }
    throw translatePluginError(e);
  }
}
