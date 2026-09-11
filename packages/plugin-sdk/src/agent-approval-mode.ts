/**
 * How cautious a tenant (then a space, then an agent) is about asking a human
 * before a capable agent runs an operation.
 *
 * This is Axis B only: it never adds a capability the token or agent grants
 * lack. A miss on Axis A is still 403 or an escalation 202.
 *
 * Restrictiveness, most to least: `manual` > `auto` > `pass-all`.
 * Effective mode is the most restrictive of the layers that are set.
 * Unset inherits. Default when nothing is set: `manual`.
 */

export const AGENT_APPROVAL_MODES = ["manual", "auto", "pass-all"] as const;

export type AgentApprovalMode = (typeof AGENT_APPROVAL_MODES)[number];

const RESTRICTIVENESS: Record<AgentApprovalMode, number> = {
  manual: 2,
  auto: 1,
  "pass-all": 0,
};

export function parseAgentApprovalMode(raw: unknown): AgentApprovalMode | null {
  if (raw === "manual" || raw === "auto" || raw === "pass-all") {
    return raw;
  }
  return null;
}

/** Most restrictive of the layers that are set. Empty → `manual`. */
export function effectiveApprovalMode(
  layers: ReadonlyArray<AgentApprovalMode | null | undefined>
): AgentApprovalMode {
  let current: AgentApprovalMode | null = null;
  for (const layer of layers) {
    if (!layer) {
      continue;
    }
    if (!current || RESTRICTIVENESS[layer] > RESTRICTIVENESS[current]) {
      current = layer;
    }
  }
  return current ?? "manual";
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
