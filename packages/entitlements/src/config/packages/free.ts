import type { EntitlementPackage } from "../../types.js";

/**
 * Free tier — starter modules, small seat/AI caps, enforced.
 * Bump `version` when changing this definition so DB sync picks it up.
 */
export const freePackage: EntitlementPackage = {
  id: "free",
  version: 2,
  label: "Free",
  modules: ["contacts", "tasks", "files"],
  featureFlags: {},
  aiUsagePolicy: {
    period_mode: "calendar",
    period_unit: "month",
    included_cost_micros: 2_000_000,
    soft_limit_cost_micros: 2_000_000,
    hard_limit_cost_micros: 3_000_000,
    enforcement_mode: "enforce",
    currency: "usd",
    allowed_models: null,
  },
  appLimits: { maxUsers: 3, enforcement_mode: "enforce" },
  pricing: {
    base_micros: 0,
    currency: "usd",
    includedUsers: 3,
    perExtraUser_micros: 0,
  },
};
