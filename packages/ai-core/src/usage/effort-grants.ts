import { AI_EFFORT_LEVELS, type AiEffort } from "../config/model-roles.js";

/**
 * Effort grants: what a plan licenses, expressed as how much thinking a tenant
 * may buy rather than which models they may name.
 *
 * A model-id allow-list goes stale the moment a vendor ships anything — every
 * release means re-listing, and a tenant that was never re-listed silently
 * loses access to the current generation. A tier grant does not: a model bound
 * to `model.high` tomorrow is covered by today's grant, because the grant talks
 * about the job, not the instrument.
 *
 * `allowed_models` / `allowed_providers` survive alongside this as the
 * self-hosted and expert-mode escape hatch. They are not the path a commercial
 * tenant walks.
 */

/** null/empty = every tier, matching how the model allow-lists read. */
export interface EffortGrant {
  allowed_efforts?: readonly AiEffort[] | null;
}

const ORDER: Readonly<Record<AiEffort, number>> = {
  low: 0,
  medium: 1,
  high: 2,
};

function normalize(
  list: readonly string[] | null | undefined
): Set<AiEffort> | null {
  if (!list || list.length === 0) {
    return null;
  }
  const set = new Set<AiEffort>();
  for (const raw of list) {
    const value = raw.trim().toLowerCase();
    if ((AI_EFFORT_LEVELS as readonly string[]).includes(value)) {
      set.add(value as AiEffort);
    }
  }
  return set.size > 0 ? set : null;
}

/** True when the plan places no restriction on effort. */
export function isEffortUnrestricted(grant: EffortGrant): boolean {
  return normalize(grant.allowed_efforts) === null;
}

export function isEffortAllowed(effort: AiEffort, grant: EffortGrant): boolean {
  const allowed = normalize(grant.allowed_efforts);
  return allowed === null || allowed.has(effort);
}

/**
 * The effort actually available to a tenant that asked for `requested`.
 *
 * Degrades downward rather than refusing: a tenant on a low-only plan who asks
 * for high gets low and an answer, not an error. Refusing would make the plan
 * boundary a failure mode instead of a product tier — and the request is
 * already paid for by the time we know the tier is too high.
 *
 * Returns null only when the plan grants no tier at all, which the write
 * boundary should refuse to store in the first place.
 */
export function clampEffort(
  requested: AiEffort,
  grant: EffortGrant
): AiEffort | null {
  const allowed = normalize(grant.allowed_efforts);
  if (allowed === null) {
    return requested;
  }
  if (allowed.has(requested)) {
    return requested;
  }
  let best: AiEffort | null = null;
  for (const candidate of allowed) {
    if (ORDER[candidate] > ORDER[requested]) {
      continue;
    }
    if (best === null || ORDER[candidate] > ORDER[best]) {
      best = candidate;
    }
  }
  // Nothing at or below the request: the plan is high-only and the caller asked
  // for low. Give them the cheapest they are entitled to rather than nothing.
  if (best === null) {
    for (const candidate of allowed) {
      if (best === null || ORDER[candidate] < ORDER[best]) {
        best = candidate;
      }
    }
  }
  return best;
}

/** Highest tier the plan allows, for "auto" routing to size against. */
export function ceilingEffort(grant: EffortGrant): AiEffort {
  const allowed = normalize(grant.allowed_efforts);
  if (allowed === null) {
    return "high";
  }
  let best: AiEffort = "low";
  for (const candidate of allowed) {
    if (ORDER[candidate] > ORDER[best]) {
      best = candidate;
    }
  }
  return best;
}
