import type {
  EntitlementAiUsagePolicy,
  EntitlementAppLimits,
  EntitlementOverride,
  EntitlementPackage,
  ResolvedEntitlements,
} from "./types.js";

/** Outcome of a seat-limit check before adding a member to a tenant. */
export interface SeatCheckResult {
  /** False only when the limit is reached AND enforcement is `enforce`. */
  allowed: boolean;
  /** True when the tenant is at/over its seat cap (regardless of mode). */
  atLimit: boolean;
  current: number;
  limit: number | null;
}

/**
 * Decide whether one more member may be added. A `null` cap is unlimited. When
 * the cap is reached, `observe` mode still allows the add (only flags
 * `atLimit`); `enforce` mode blocks it. Pure.
 */
export function checkSeatLimit(
  currentUserCount: number,
  appLimits: Pick<EntitlementAppLimits, "maxUsers" | "enforcement_mode">
): SeatCheckResult {
  const limit = appLimits.maxUsers;
  if (limit === null) {
    return { allowed: true, atLimit: false, limit, current: currentUserCount };
  }
  const atLimit = currentUserCount >= limit;
  return {
    allowed: !atLimit || appLimits.enforcement_mode !== "enforce",
    atLimit,
    limit,
    current: currentUserCount,
  };
}

/** AI policy applied to a tenant with no package: observe-only, no limits. */
export const FREE_AI_USAGE_POLICY: EntitlementAiUsagePolicy = {
  period_mode: "calendar",
  period_unit: "month",
  included_cost_micros: null,
  hard_limit_cost_micros: null,
  soft_limit_cost_micros: null,
  enforcement_mode: "observe",
  currency: "usd",
  allowed_models: null,
  allowed_providers: null,
  allowed_efforts: null,
};

/** App limits applied to a tenant with no package: unlimited seats, observe. */
export const FREE_APP_LIMITS: EntitlementAppLimits = {
  maxUsers: null,
  enforcement_mode: "observe",
};

/**
 * Resolved entitlements for a tenant with no assigned package: all modules
 * allowed, no package flags, observe-only policies. The starting point that a
 * package (and then an override) narrows.
 */
export const FREE_ENTITLEMENTS: ResolvedEntitlements = {
  packageId: null,
  modules: null,
  featureFlags: {},
  aiUsagePolicy: FREE_AI_USAGE_POLICY,
  appLimits: FREE_APP_LIMITS,
};

/**
 * Compose a package with a sparse per-tenant override into resolved
 * entitlements. Precedence is always override > package > free default:
 *
 * - `modules`: override replaces the package list when present (including an
 *   explicit `null` to lift the restriction); otherwise the package list.
 * - `featureFlags`: package values, then override values merged key-by-key.
 * - `aiUsagePolicy` / `appLimits`: package values, then override fields merged.
 *
 * Passing a `null` package resolves the free default (optionally overridden).
 * Pure and side-effect free.
 */
export function resolveEntitlements(
  pkg: EntitlementPackage | null,
  override?: EntitlementOverride | null
): ResolvedEntitlements {
  const base: ResolvedEntitlements = pkg
    ? {
        packageId: pkg.id,
        modules: pkg.modules,
        featureFlags: { ...pkg.featureFlags },
        aiUsagePolicy: { ...pkg.aiUsagePolicy },
        appLimits: { ...pkg.appLimits },
      }
    : {
        packageId: null,
        modules: FREE_ENTITLEMENTS.modules,
        featureFlags: {},
        aiUsagePolicy: { ...FREE_AI_USAGE_POLICY },
        appLimits: { ...FREE_APP_LIMITS },
      };

  if (!override) {
    return base;
  }

  return {
    packageId: base.packageId,
    modules: override.modules === undefined ? base.modules : override.modules,
    featureFlags: { ...base.featureFlags, ...override.featureFlags },
    aiUsagePolicy: { ...base.aiUsagePolicy, ...override.aiUsagePolicy },
    appLimits: { ...base.appLimits, ...override.appLimits },
  };
}

/**
 * True when `moduleId` is permitted by the resolved module allow-list. A `null`
 * allow-list (no package restriction) permits everything. Required/core modules
 * are handled by the caller (the enforcement point exempts them) — this only
 * answers the package-license question.
 */
export function isModuleLicensed(
  resolved: Pick<ResolvedEntitlements, "modules">,
  moduleId: string
): boolean {
  return resolved.modules === null || resolved.modules.includes(moduleId);
}
