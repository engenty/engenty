import type { AiSettingSource } from "@engenty/ai-core";

export const DEFAULT_AGENT_MAX_STEPS = 24;
export const MAX_AGENT_MAX_STEPS = 60;

/** Clamp any requested step count into the allowed [1, platform max] range. */
export function clampAgentMaxSteps(value: number): number {
  return Math.min(Math.max(Math.floor(value), 1), MAX_AGENT_MAX_STEPS);
}

function positiveInt(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

/** Platform layer: env `ENGENTY_AI_AGENT_MAX_STEPS`, else the package default. */
function platformMaxSteps(): { value: number; fromEnv: boolean } {
  const raw = process.env.ENGENTY_AI_AGENT_MAX_STEPS?.trim();
  if (!raw) {
    return { value: DEFAULT_AGENT_MAX_STEPS, fromEnv: false };
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return { value: DEFAULT_AGENT_MAX_STEPS, fromEnv: false };
  }
  return { value: clampAgentMaxSteps(parsed), fromEnv: true };
}

export interface ResolveAgentMaxStepsOptions {
  /** Per-agent cap (`config.limits.max_steps`). */
  agentOverride?: number | null;
  /** Tenant default cap (`ai.config.caps.max_steps`). */
  tenantDefault?: number | null;
}

export interface ResolvedAgentMaxSteps {
  source: AiSettingSource;
  value: number;
}

/**
 * Resolve the per-run reasoning-iteration cap with provenance, along
 * agent → tenant → platform(env) → default. The hard ceiling (60) is always
 * enforced — a per-agent or tenant value can only tighten the cap.
 */
export function resolveAgentMaxStepsWithSource(
  options: ResolveAgentMaxStepsOptions = {}
): ResolvedAgentMaxSteps {
  const agent = positiveInt(options.agentOverride);
  if (agent != null) {
    return { value: clampAgentMaxSteps(agent), source: "agent" };
  }
  const tenant = positiveInt(options.tenantDefault);
  if (tenant != null) {
    return { value: clampAgentMaxSteps(tenant), source: "tenant" };
  }
  const platform = platformMaxSteps();
  return {
    value: platform.value,
    source: platform.fromEnv ? "platform" : "default",
  };
}

/**
 * Resolve the per-run iteration cap. A finite per-agent `limits.max_steps`
 * override takes precedence over the global `ENGENTY_AI_AGENT_MAX_STEPS` default
 * and is clamped to [1, 60]; a non-finite/absent override falls back to the env
 * default (also clamped).
 */
export function resolveAgentMaxSteps(
  agentMaxStepsOverride?: number | null
): number {
  if (
    typeof agentMaxStepsOverride === "number" &&
    Number.isFinite(agentMaxStepsOverride)
  ) {
    return clampAgentMaxSteps(agentMaxStepsOverride);
  }
  return platformMaxSteps().value;
}
