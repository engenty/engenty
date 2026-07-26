// Effort choices as the end-user surface: how much thinking a task deserves,
// never a model id. The plan's `allowed_efforts` decides which tiers a tenant
// may pick; everything here is pure so the grant rules can be tested without a
// DOM or a policy request.

import {
  AI_EFFORT_LEVELS,
  type AiEffort,
  type AiEffortChoice,
  clampEffort,
  isEffortAllowed,
} from "@engenty/ai-core/browser";

/** Display order: the absence of a choice first, then cheapest → most thinking. */
export const AI_EFFORT_CHOICES: readonly AiEffortChoice[] = [
  "auto",
  ...AI_EFFORT_LEVELS,
];

export interface EffortChoiceOption {
  /** False = the plan does not license this tier; render it disabled, not hidden. */
  allowed: boolean;
  value: AiEffortChoice;
}

/**
 * The policy API types `allowed_efforts` as `string[]` (it crosses the wire).
 * Narrow it to the closed set before handing it to the ai-core grant helpers,
 * so an unknown tier from a newer service is ignored rather than trusted.
 */
export function toEffortGrant(
  allowedEfforts: readonly string[] | null | undefined
): { allowed_efforts: readonly AiEffort[] | null } {
  const known = (allowedEfforts ?? []).filter((value): value is AiEffort =>
    (AI_EFFORT_LEVELS as readonly string[]).includes(value)
  );
  return { allowed_efforts: known.length > 0 ? known : null };
}

/**
 * `auto` is always offered: it is the router sizing the work inside whatever
 * the plan grants, so it can never exceed the entitlement.
 */
export function buildEffortChoiceOptions(
  allowedEfforts: readonly string[] | null | undefined
): EffortChoiceOption[] {
  const grant = toEffortGrant(allowedEfforts);
  return AI_EFFORT_CHOICES.map((value) => ({
    allowed: value === "auto" || isEffortAllowed(value, grant),
    value,
  }));
}

/**
 * The choice a tenant actually gets. Degrades downward instead of refusing —
 * a stored "high" on a plan that later drops to low-only becomes "low", not an
 * error the user has to clear before they can send anything.
 */
export function resolveEffortChoice(
  requested: AiEffortChoice,
  allowedEfforts: readonly string[] | null | undefined
): AiEffortChoice {
  if (requested === "auto") {
    return "auto";
  }
  return clampEffort(requested, toEffortGrant(allowedEfforts)) ?? "auto";
}

/** True when the plan withholds at least one tier, so the UI can say why. */
export function isEffortRestricted(
  allowedEfforts: readonly string[] | null | undefined
): boolean {
  const grant = toEffortGrant(allowedEfforts);
  return AI_EFFORT_LEVELS.some((effort) => !isEffortAllowed(effort, grant));
}
