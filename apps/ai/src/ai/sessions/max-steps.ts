const DEFAULT_AGENT_MAX_STEPS = 24;
const MAX_AGENT_MAX_STEPS = 60;

export function resolveAgentMaxSteps(): number {
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
