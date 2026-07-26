import type { EntitlementPackage } from "../../types.js";

/**
 * Team tier — SMB module set with enforced seat/AI caps.
 * Bump `version` when changing this definition so DB sync picks it up.
 */
export const teamPackage: EntitlementPackage = {
  id: "team",
  version: 2,
  label: "Team",
  modules: [
    "contacts",
    "tasks",
    "files",
    "projects",
    "knowledge-base",
    "inbox",
    "offers",
  ],
  featureFlags: { "kb.ai-triage": true },
  aiUsagePolicy: {
    period_mode: "calendar",
    period_unit: "month",
    included_cost_micros: 20_000_000,
    soft_limit_cost_micros: 20_000_000,
    hard_limit_cost_micros: 40_000_000,
    enforcement_mode: "enforce",
    currency: "usd",
    allowed_models: null,
    allowed_providers: null,
  },
  appLimits: { maxUsers: 25, enforcement_mode: "enforce" },
  pricing: {
    base_micros: 49_000_000,
    currency: "usd",
    includedUsers: 25,
    perExtraUser_micros: 5_000_000,
  },
};
