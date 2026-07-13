import type { EntitlementPackage } from "./types.js";

/**
 * The authored commercial-package catalog. Synced into `core.packages` at boot
 * (version-based upsert) with a restore-defaults path, mirroring the model
 * pricing seeds in `@engenty/ai-core`. Edit here and bump the entry `version`
 * to roll a change out; the sync upserts entries whose version is newer.
 *
 * Module ids are the plugin ids used by the plugin registry / tenant overrides.
 * Core/required modules (settings, copilot) are always allowed by the
 * enforcement point regardless of a package's allow-list, so they are omitted
 * from the lists below.
 */
export const DEFAULT_ENTITLEMENT_PACKAGES: readonly EntitlementPackage[] = [
  {
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
  },
  {
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
    },
    appLimits: { maxUsers: 25, enforcement_mode: "enforce" },
    pricing: {
      base_micros: 49_000_000,
      currency: "usd",
      includedUsers: 25,
      perExtraUser_micros: 5_000_000,
    },
  },
  {
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
    },
    appLimits: { maxUsers: 100, enforcement_mode: "enforce" },
    pricing: {
      base_micros: 199_000_000,
      currency: "usd",
      includedUsers: 100,
      perExtraUser_micros: 4_000_000,
    },
  },
  {
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
  },
];

/** Look up an authored package by id. */
export function findEntitlementPackage(
  id: string
): EntitlementPackage | undefined {
  return DEFAULT_ENTITLEMENT_PACKAGES.find((pkg) => pkg.id === id);
}
