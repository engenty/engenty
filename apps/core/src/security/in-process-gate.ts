import type { PluginAuthContext } from "@engenty/plugin-sdk";
import type { PluginRegistry } from "../plugins/registry.js";
import type { SecurityAuditLogAdapter } from "./audit-adapter.js";
import { recordModuleAuditEvent } from "./audit-service.js";
import type { PrincipalContext } from "./auth.js";
import { evaluatePolicy, type PolicyDeps } from "./policy.js";
import { resolveLinkedPrincipal } from "./principal-link.js";

/**
 * Thrown when the in-process gate refuses a call. Modules already wrap their
 * cross-module calls in try/catch ("the other module may not be loaded"), so a
 * throw degrades the same way an absent module does at every existing site —
 * unlike a silent `null`, which would read as "operation not registered".
 */
export class InProcessPolicyError extends Error {
  readonly action: "deny" | "require_approval";
  readonly moduleId: string;
  readonly operationId: string;
  readonly reason: string;

  constructor(params: {
    action: "deny" | "require_approval";
    moduleId: string;
    operationId: string;
    reason: string;
  }) {
    super(
      `in-process call to ${params.operationId} denied by policy: ${params.reason}`
    );
    this.name = "InProcessPolicyError";
    this.action = params.action;
    this.moduleId = params.moduleId;
    this.operationId = params.operationId;
    this.reason = params.reason;
  }
}

/**
 * Services the gate consults, bound late: the registry is built before the
 * approval service and audit log exist (see registry.setPolicyDeps). Until
 * they are populated the gate still runs — grants simply cannot open it, which
 * only ever tightens the decision.
 */
export interface InProcessPolicyDeps extends PolicyDeps {
  auditLog?: SecurityAuditLogAdapter | null;
}

export interface InProcessCall {
  auth?: PluginAuthContext;
  input?: unknown;
  moduleId: string;
  operationId: string;
  requiredCapabilities: string[];
  requiresApproval: boolean;
  riskLevel: "low" | "medium" | "high" | "critical";
}

/**
 * Reconstruct a principal from the auth object a module handed us, for the
 * calls core did not create the auth for (a module building its own context —
 * e.g. the projects portal acting for an anonymous visitor). Lossy by
 * necessity, and lossy in the SAFE direction: unknown roles/permissions are
 * empty, and empty `moduleIds`/`scopes` mean "unrestricted" only because the
 * capability list — which we DO have — is the real ceiling.
 *
 * `authMethod` follows `principalType`: a "service" principal reaching this
 * edge came through a transport that verified a service credential, and the
 * unattended platform-service lane in evaluatePolicyRules keys on that pair.
 * An agent riding a service token still carries `agentId`, which keeps the
 * escalation.
 */
function reconstructPrincipal(auth: PluginAuthContext): PrincipalContext {
  const principalType = auth.principalType ?? "user";
  return {
    audience: [],
    authMethod: principalType === "service" ? "service_credential" : "oauth",
    capabilities: auth.capabilities ?? [],
    delegationChain: [],
    moduleIds: [],
    permissions: [],
    principalId: auth.principalId,
    principalType,
    roleProfiles: [],
    roles: [],
    scopes: [],
    tenantId: auth.tenantId,
    tokenType: "unknown",
    ...(auth.agentId ? { agentId: auth.agentId } : {}),
    ...(auth.goalId ? { goalId: auth.goalId } : {}),
  };
}

function auditDecision(
  deps: InProcessPolicyDeps | undefined,
  call: InProcessCall,
  principal: PrincipalContext,
  event: { detail: Record<string, unknown>; type: string }
): void {
  const auditLog = deps?.auditLog;
  if (!auditLog) {
    return;
  }
  recordModuleAuditEvent(
    auditLog,
    call.moduleId,
    {
      type: event.type,
      actorId: principal.principalId,
      tenantId: principal.tenantId,
      moduleId: call.moduleId,
      operationId: call.operationId,
      detail: event.detail,
    },
    { component: "in-process" }
  );
}

/**
 * Run the same policy the three HTTP transports run, before an in-process
 * dispatch executes a module operation handler. Throws on deny; returns
 * normally on allow.
 *
 * `require_approval` cannot answer 202 mid-handler, so it resolves in this
 * order: a covering grant (already spent by evaluatePolicy) → the outer edge
 * was itself approval-gated and passed (`approvedEdge`; the human approved the
 * outer operation and its declared side effects execute under that approval)
 * → deny. A module that needs an unattended nested gated call must file a
 * durable approval from its own flow rather than slip past this.
 */
export async function enforceInProcessPolicy(
  call: InProcessCall,
  registry?: Pick<PluginRegistry, "profilePolicies">,
  deps?: InProcessPolicyDeps
): Promise<void> {
  const linked = resolveLinkedPrincipal(call.auth);
  const gatedOperation =
    call.requiresApproval ||
    call.riskLevel === "high" ||
    call.riskLevel === "critical";
  // No caller identity at all. Every live in-process site passes `ctx.auth`;
  // an operation that declares an authorization requirement must not run for a
  // caller we cannot name. (An operation declaring nothing still falls through
  // to the inferred-capability check below, against no capabilities.)
  if (!call.auth && (call.requiredCapabilities.length > 0 || gatedOperation)) {
    throw new InProcessPolicyError({
      action: "deny",
      moduleId: call.moduleId,
      operationId: call.operationId,
      reason: "no auth context on in-process call",
    });
  }
  const principal = linked
    ? linked.principal
    : reconstructPrincipal(
        call.auth ?? { principalId: "", scopeId: "default", tenantId: "" }
      );
  const decision = await evaluatePolicy(
    {
      auth: principal,
      moduleId: call.moduleId,
      operationId: call.operationId,
      requiredCapabilities: call.requiredCapabilities,
      requiresApproval: call.requiresApproval,
      riskLevel: call.riskLevel,
      transport: "in_process",
      input: call.input,
    },
    registry,
    deps
  );
  if (decision.action === "allow") {
    return;
  }
  if (decision.action === "require_approval" && linked?.approvedEdge) {
    return;
  }
  auditDecision(deps, call, principal, {
    type: "policy.deny",
    detail: { reason: decision.reason, action: decision.action },
  });
  throw new InProcessPolicyError({
    action: decision.action,
    moduleId: call.moduleId,
    operationId: call.operationId,
    reason: decision.reason,
  });
}
