import type { EntitlementPackage } from "../../types.js";

/**
 * Enterprise tier — no module restriction; metered AI/seats (observe only).
 * Bump `version` when changing this definition so DB sync picks it up.
 */
export const enterprisePackage: EntitlementPackage = {
  id: "enterprise",
  version: 2,
  label: "Enterprise",
  // null = no module restriction (every module allowed).
  modules: null,
  featureFlags: { "kb.ai-triage": true },
  aiUsagePolicy: {
    period_mode: "calendar",
    period_unit: "month",
    included_cost_micros: null,
    soft_limit_cost_micros: null,
    hard_limit_cost_micros: null,
    // Metered, not capped — observe only.
    enforcement_mode: "observe",
    currency: "usd",
    allowed_models: null,
  },
  appLimits: { maxUsers: null, enforcement_mode: "observe" },
  pricing: {
    base_micros: 0,
    currency: "usd",
    includedUsers: null,
    perExtraUser_micros: 0,
  },
};
