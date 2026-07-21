const DEFAULT_AGENT_MAX_STEPS = 24;
const MAX_AGENT_MAX_STEPS = 60;

/**
 * Resolve the per-run reasoning-iteration cap. A per-agent `limits.max_steps`
 * (from the agent's config) takes precedence over the global
 * `ENGENTY_AI_AGENT_MAX_STEPS` default, but the hard ceiling (60) is always
 * enforced — a per-agent value can only tighten the cap, never raise it above
 * the ceiling.
 */
export function resolveAgentMaxSteps(agentMaxStepsOverride?: number): number {
  if (
    typeof agentMaxStepsOverride === "number" &&
    Number.isFinite(agentMaxStepsOverride)
  ) {
    return Math.min(Math.max(agentMaxStepsOverride, 1), MAX_AGENT_MAX_STEPS);
  }
  const raw = process.env.ENGENTY_AI_AGENT_MAX_STEPS?.trim();
  if (!raw) {
    return DEFAULT_AGENT_MAX_STEPS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_AGENT_MAX_STEPS;
  }
  return Math.min(Math.max(parsed, 1), MAX_AGENT_MAX_STEPS);
}
