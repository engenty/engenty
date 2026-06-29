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
  if (auth.capabilities.includes("*")) {
    return true;
  }
  if (
    auth.capabilities.includes("core.superadmin") ||
    auth.capabilities.includes("core.*")
  ) {
    return true;
  }
  if (auth.capabilities.includes(required)) {
    return true;
  }
  const [prefix] = required.split(".");
  return auth.capabilities.includes(`${prefix}.*`);
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

function evaluateProfilePolicies(
  input: PolicyInput,
  registry?: Pick<PluginRegistry, "profilePolicies">
): PolicyDecision | null {
  for (const entry of registry?.profilePolicies ?? []) {
    const decision = entry.policy(input);
    if (decision) {
      return decision;
    }
  }
  return null;
}

export function evaluatePolicy(
  input: PolicyInput,
  registry?: Pick<PluginRegistry, "profilePolicies">
): PolicyDecision {
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
  const profileDecision = evaluateProfilePolicies(input, registry);
  if (profileDecision) {
    return profileDecision;
  }
  if (
    auth.principalType !== "user" &&
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
