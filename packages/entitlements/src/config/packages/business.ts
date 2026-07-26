import type { EntitlementPackage } from "../../types.js";

/**
 * Business tier — full commercial module set with higher enforced caps.
 * Bump `version` when changing this definition so DB sync picks it up.
 */
export const businessPackage: EntitlementPackage = {
  id: "business",
  version: 2,
  label: "Business",
  modules: [
    "contacts",
    "tasks",
    "files",
    "projects",
    "knowledge-base",
    "inbox",
    "offers",
    "invoices",
    "pdf-templates",
    "time-tracking",
    "context-graph",
  ],
  featureFlags: { "kb.ai-triage": true },
  aiUsagePolicy: {
    period_mode: "calendar",
    period_unit: "month",
    included_cost_micros: 100_000_000,
    soft_limit_cost_micros: 100_000_000,
    hard_limit_cost_micros: 200_000_000,
    enforcement_mode: "enforce",
    currency: "usd",
    allowed_models: null,
    allowed_providers: null,
    allowed_efforts: null,
  },
  appLimits: { maxUsers: 100, enforcement_mode: "enforce" },
  pricing: {
    base_micros: 199_000_000,
    currency: "usd",
    includedUsers: 100,
    perExtraUser_micros: 4_000_000,
  },
};
