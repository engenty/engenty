/**
 * How cautious a tenant (then a space, then an agent) is about asking a human
 * before a capable agent runs an operation.
 *
 * This is Axis B only: it never adds a capability the token or agent grants
 * lack. A miss on Axis A is still 403 or an escalation 202.
 *
 * Caution, most to least: `manual` > `auto` > `pass-all`.
 * The agent's own mode decides when it is set — also when it is looser than
 * the space or tenant (decided 2026-09-24): the mode is bound to the agent.
 * Unset inherits: agent → the agent's platform default → space → tenant →
 * `manual`. See {@link resolveAgentApprovalMode}.
 */

export const AGENT_APPROVAL_MODES = ["manual", "auto", "pass-all"] as const;

export type AgentApprovalMode = (typeof AGENT_APPROVAL_MODES)[number];

export function parseAgentApprovalMode(raw: unknown): AgentApprovalMode | null {
  if (raw === "manual" || raw === "auto" || raw === "pass-all") {
    return raw;
  }
  return null;
}

/**
 * Agents whose mode, when nobody set one, is not the space's. The copilot is
 * the person's own and works while they watch: `auto` asks only for the risky
 * and the unmounted.
 */
export const DEFAULT_AGENT_APPROVAL_MODES: Readonly<
  Record<string, AgentApprovalMode>
> = { "engenty.copilot": "auto" };

/**
 * The effective mode for one agent: its own setting, else its platform
 * default, else the space's, else the tenant's, else `manual`.
 */
export function resolveAgentApprovalMode(input: {
  /** The agent type key (`engenty.copilot`, `<space>.chief-of-staff`). */
  agentKey?: string | null;
  agentMode: AgentApprovalMode | null;
  spaceMode: AgentApprovalMode | null;
  tenantMode: AgentApprovalMode | null;
}): AgentApprovalMode {
  return (
    input.agentMode ??
    (input.agentKey ? DEFAULT_AGENT_APPROVAL_MODES[input.agentKey] : null) ??
    input.spaceMode ??
    input.tenantMode ??
    "manual"
  );
}

export function shouldAskHuman(input: {
  mode: AgentApprovalMode;
  requiresApproval: boolean;
  riskLevel: "low" | "medium" | "high" | "critical";
  spaceWriteMounted: boolean;
}): boolean {
  if (input.mode === "pass-all") {
    return false;
  }
  if (input.mode === "manual") {
    return (
      input.requiresApproval ||
      input.riskLevel === "high" ||
      input.riskLevel === "critical"
    );
  }
  if (input.riskLevel === "high" || input.riskLevel === "critical") {
    return true;
  }
  if (input.riskLevel === "low") {
    return false;
  }
  if (!input.requiresApproval) {
    return false;
  }
  return !input.spaceWriteMounted;
}
