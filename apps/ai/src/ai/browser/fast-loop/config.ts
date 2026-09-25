// The switch and its knobs. Env-manifest keys, DB-overridable through
// platform settings and hydrated into process.env (D2).

import { createClassifierClient } from "@engenty/ai-core";

export const FAST_LOOP_ENABLED_ENV = "ENGENTY_BROWSER_FAST_LOOP";
export const FAST_LOOP_MIN_MARGIN_ENV = "ENGENTY_BROWSER_FAST_MIN_MARGIN";
export const FAST_LOOP_MAX_STEPS_ENV = "ENGENTY_BROWSER_FAST_MAX_STEPS";

export const DEFAULT_FAST_LOOP_MIN_MARGIN = 0.1;
export const DEFAULT_FAST_LOOP_MAX_STEPS = 60;
/** Nobody gets more than this per call, whatever the setting says. */
export const FAST_LOOP_MAX_STEPS_CEILING = 200;

export type EnvReader = (key: string) => string | undefined;

const defaultReadEnv: EnvReader = (key) => process.env[key];

function isTruthy(value: string | undefined): boolean {
  const v = value?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/**
 * Switch on AND the run's `classifier` binding reachable — Jev on TypeSafe's
 * own key or the Vercel AI Gateway key, or a bound LLM on its gateway's key.
 * Otherwise the tool is not offered.
 */
export function isFastLoopEnabled(
  classifierModelId: string | null | undefined,
  readEnv: EnvReader = defaultReadEnv
): boolean {
  if (!isTruthy(readEnv(FAST_LOOP_ENABLED_ENV))) {
    return false;
  }
  return createClassifierClient(classifierModelId, { readEnv }) !== null;
}

export function resolveFastLoopMinMargin(
  readEnv: EnvReader = defaultReadEnv
): number {
  const parsed = Number.parseFloat(readEnv(FAST_LOOP_MIN_MARGIN_ENV) ?? "");
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return DEFAULT_FAST_LOOP_MIN_MARGIN;
  }
  return parsed;
}

export function resolveFastLoopMaxSteps(
  readEnv: EnvReader = defaultReadEnv
): number {
  const parsed = Number.parseInt(readEnv(FAST_LOOP_MAX_STEPS_ENV) ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_FAST_LOOP_MAX_STEPS;
  }
  return Math.min(parsed, FAST_LOOP_MAX_STEPS_CEILING);
}
