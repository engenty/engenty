import { capabilityCovers } from "@engenty/plugin-sdk";
import type { PluginRegistry } from "../plugins/registry.js";
import type { PrincipalContext } from "./auth.js";

export type PolicyAction = "allow" | "deny" | "require_approval";

export interface PolicyDecision {
  action: PolicyAction;
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
  transport?: "gateway" | "module_ops" | "mcp" | "http";
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

export async function evaluatePolicy(
  input: PolicyInput,
  registry?: Pick<PluginRegistry, "profilePolicies">
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
  if (
    auth.principalType !== "user" &&
    !isPlatformServiceLane &&
    (input.requiresApproval ||
      input.riskLevel === "high" ||
      input.riskLevel === "critical")
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
