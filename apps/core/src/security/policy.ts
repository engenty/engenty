import {
  type AgentApprovalMode,
  capabilityCovers,
  shouldAskHuman,
} from "@engenty/plugin-sdk";
import type { PluginRegistry } from "../plugins/registry.js";
import type { PrincipalContext } from "./auth.js";

export type PolicyAction = "allow" | "deny" | "require_approval";

export interface PolicyDecision {
  action: PolicyAction;
  /**
   * With `require_approval`: module detail a profile policy attached (e.g.
   * which connection an ask resolved to). The approval gate stores it on the
   * request it files, so the owning module's UI can describe the blocked call.
   * Profile-policy decisions pass through evaluatePolicy verbatim, carrying it.
   */
  approvalContext?: Record<string, unknown>;
  reason: string;
}

export interface PolicyInput {
  auth: PrincipalContext;
  input?: unknown;
  moduleId: string;
  operationId: string;
  requiredCapabilities: string[];
  requiresApproval: boolean;
  riskLevel: "low" | "medium" | "high" | "critical";
  scopeId?: string;
  /**
   * `in_process` is the module-to-module edge (a handler calling another
   * module's operation through the plugin runtime API) — no HTTP request
   * behind it, so a profile policy that needs to tell the edges apart can.
   */
  transport?: "gateway" | "module_ops" | "mcp" | "http" | "in_process";
}

/**
 * Stores the policy engine may consult beyond the token itself. Structural on
 * purpose (matches `createApprovalService(...).consumeGrant`) so policy.ts
 * stays decoupled from the sdk's concrete service type.
 */
export interface PolicyDeps {
  approvalService?: {
    consumeGrant(input: {
      actorId: string;
      moduleId: string;
      operationId: string;
      sessionId?: string;
      subjectIds?: string[];
      tenantId: string;
    }): Promise<boolean>;
  } | null;
  /**
   * Tenant/space/agent approval-mode overlay. Absent → `manual` (today's
   * high/critical / requiresApproval gate). Never skips a missing capability.
   */
  resolveAgentApproval?: (input: PolicyInput) => Promise<{
    mode: AgentApprovalMode;
    spaceWriteMounted: boolean;
  }>;
}

function hasCapability(auth: PrincipalContext, required: string): boolean {
  // Delegates to the shared plugin-sdk matcher — single source of truth so
  // server enforcement can never drift from the clamp/UI tester.
  return capabilityCovers(auth.capabilities, required);
}

function inferCapabilityFromOperation(operationId: string): string {
  if (
    operationId.endsWith(".list") ||
    operationId.endsWith(".get") ||
    operationId.includes(".read")
  ) {
    return "module.read";
  }
  return "module.write";
}

async function evaluateProfilePolicies(
  input: PolicyInput,
  registry?: Pick<PluginRegistry, "profilePolicies">
): Promise<PolicyDecision | null> {
  for (const entry of registry?.profilePolicies ?? []) {
    // Policies may be async (e.g. connections resolves per-connection state).
    const decision = await entry.policy(input);
    if (decision) {
      return decision;
    }
  }
  return null;
}

/**
 * The full policy decision, grants included (D2 phase 3). A standing or
 * subject-bound approval is authorization state exactly like a capability, so
 * the policy engine consults it here instead of every transport pairing a
 * "require_approval" result with its own consume-then-request sequence. When
 * the decision would be `require_approval` and a grant covers the call, the
 * grant is SPENT (a once-grant is deleted) and the decision becomes `allow` —
 * callers only ever see `require_approval` when a human genuinely has to
 * answer, and their sole remaining job is to file the request.
 */
export async function evaluatePolicy(
  input: PolicyInput,
  registry?: Pick<PluginRegistry, "profilePolicies">,
  deps?: PolicyDeps
): Promise<PolicyDecision> {
  const decision = await evaluatePolicyRules(input, registry, deps);
  if (decision.action !== "require_approval" || !deps?.approvalService) {
    return decision;
  }
  const { auth } = input;
  // The run's task, trigger and goal are the subjects its grants may be bound
  // to: an approval given for THIS task's (or routine's) work must open the
  // gate for whichever principal ended up executing the retry, and for
  // nothing outside that work.
  const subjectIds = [auth.taskId, auth.triggerId, auth.goalId].filter(
    (id): id is string => !!id
  );
  const granted = await deps.approvalService.consumeGrant({
    actorId: auth.principalId,
    moduleId: input.moduleId,
    operationId: input.operationId,
    tenantId: auth.tenantId,
    ...(auth.sessionId ? { sessionId: auth.sessionId } : {}),
    ...(subjectIds.length > 0 ? { subjectIds } : {}),
  });
  if (granted) {
    return { action: "allow", reason: "approval grant" };
  }
  return decision;
}

async function evaluatePolicyRules(
  input: PolicyInput,
  registry?: Pick<PluginRegistry, "profilePolicies">,
  deps?: PolicyDeps
): Promise<PolicyDecision> {
  const { auth, moduleId, requiredCapabilities, operationId, scopeId } = input;
  if (auth.moduleIds.length > 0 && !auth.moduleIds.includes(moduleId)) {
    return { action: "deny", reason: "module not allowed for actor" };
  }
  if (scopeId && auth.scopes.length > 0 && !auth.scopes.includes(scopeId)) {
    return { action: "deny", reason: "scope not allowed for actor" };
  }
  const required =
    requiredCapabilities.length > 0
      ? requiredCapabilities
      : [inferCapabilityFromOperation(operationId)];
  for (const capability of required) {
    if (!hasCapability(auth, capability)) {
      return { action: "deny", reason: `missing capability: ${capability}` };
    }
  }
  const profileDecision = await evaluateProfilePolicies(input, registry);
  if (profileDecision) {
    return profileDecision;
  }
  // The platform's own service credential acting on its own behalf (no agent
  // in the chain) is unattended by definition — the scheduler's trigger
  // reconcile and fires have no human who could ever answer an approval, so
  // escalating deadlocks them. Its authority is the capability clamp baked
  // into the credential, checked above. An agent riding the service token
  // (headless task runs forward x-engenty-agent-id) keeps the escalation:
  // that is the durable-approvals lane.
  const isPlatformServiceLane =
    auth.principalType === "service" &&
    auth.authMethod === "service_credential" &&
    !auth.agentId;
  if (auth.principalType === "user" || isPlatformServiceLane) {
    return { action: "allow", reason: "policy allow" };
  }

  const resolved = deps?.resolveAgentApproval
    ? await deps.resolveAgentApproval(input)
    : { mode: "manual" as const, spaceWriteMounted: false };
  if (
    shouldAskHuman({
      mode: resolved.mode,
      requiresApproval: input.requiresApproval,
      riskLevel: input.riskLevel,
      spaceWriteMounted: resolved.spaceWriteMounted,
    })
  ) {
    return {
      action: "require_approval",
      reason: "operation requires human approval",
    };
  }
  return { action: "allow", reason: "policy allow" };
}

function evaluateRegisteredResultPolicies(
  input: PolicyInput,
  result: unknown,
  registry?: Pick<PluginRegistry, "resultPolicies">
): PolicyDecision | null {
  for (const entry of registry?.resultPolicies ?? []) {
    const decision = entry.policy(input, result);
    if (decision) {
      return decision;
    }
  }
  return null;
}

export function evaluateResultPolicy(
  input: PolicyInput,
  result: unknown,
  registry?: Pick<PluginRegistry, "resultPolicies">
): PolicyDecision | null {
  return evaluateRegisteredResultPolicies(input, result, registry);
}
