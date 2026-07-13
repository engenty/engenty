/**
 * Commercial-package entitlement types.
 *
 * A **package** is an authored, versioned bundle of what a tenant is licensed
 * for: which modules, which feature-flag values, an AI usage policy, and app
 * limits (seats). A tenant is assigned one package plus an optional sparse
 * **override** (per-tenant deltas). The **resolver** composes package → override
 * into **resolved entitlements**, which are then fed into the existing
 * enforcement points (plugin effective-state, feature-flag resolution, the AI
 * usage-policy engine, and the user-create seat check).
 *
 * Authored as plain TS (interface + readonly catalog), mirroring the model
 * pricing seeds in `@engenty/ai-core`. Zod validation (see `schema.ts`) applies
 * only at the HTTP write boundary.
 */

export type EntitlementEnforcementMode = "observe" | "enforce";

/**
 * AI usage policy a package can set. Mirrors the writable subset of
 * `TenantUsagePolicyRecord` (`@engenty/ai-core` `usage/contracts`) — the fields
 * that are upserted into `ai.tenant_usage_policy` when a package is assigned.
 * The free-text `tier` on that record is superseded by the package id.
 */
export interface EntitlementAiUsagePolicy {
  /** Model allow-list; null = all models permitted. */
  allowed_models: string[] | null;
  currency: string;
  enforcement_mode: EntitlementEnforcementMode;
  /** Hard cap; requests blocked past this in `enforce` mode. null = none. */
  hard_limit_cost_micros: number | null;
  /** Included spend before soft/hard limits. null = unlimited. */
  included_cost_micros: number | null;
  period_mode: "calendar" | "rolling";
  period_unit: "day" | "week" | "month";
  /** Soft cap; surfaces a warning reason but never blocks. null = none. */
  soft_limit_cost_micros: number | null;
}

/** App-level limits (v1: seats only). */
export interface EntitlementAppLimits {
  /** How the seat cap is applied on user-create paths. */
  enforcement_mode: EntitlementEnforcementMode;
  /** Seat cap. null = unlimited. */
  maxUsers: number | null;
}

/** An authored commercial package (one catalog entry). */
export interface EntitlementPackage {
  aiUsagePolicy: EntitlementAiUsagePolicy;
  appLimits: EntitlementAppLimits;
  /** Feature-flag values this package sets. Compose UNDER per-tenant overrides. */
  featureFlags: Record<string, boolean>;
  /** Stable id, referenced by `core.tenants.package_id`. */
  id: string;
  label: string;
  /**
   * Module allow-list: only these module ids may be tenant-enabled. `null` means
   * no package restriction (all modules allowed). Core/required modules are
   * always allowed regardless — the enforcement point exempts them.
   */
  modules: string[] | null;
  /** Bumped on any change to this entry; the DB sync upserts on a higher version. */
  version: number;
}

/**
 * Sparse per-tenant delta over the assigned package. Every field optional.
 * `featureFlags` merges key-by-key; `aiUsagePolicy`/`appLimits` merge
 * field-by-field; `modules`, when present (including `null`), replaces the
 * package list.
 */
export interface EntitlementOverride {
  aiUsagePolicy?: Partial<EntitlementAiUsagePolicy>;
  appLimits?: Partial<EntitlementAppLimits>;
  featureFlags?: Record<string, boolean>;
  modules?: string[] | null;
}

/** Fully resolved entitlements for a tenant (package composed with override). */
export interface ResolvedEntitlements {
  aiUsagePolicy: EntitlementAiUsagePolicy;
  appLimits: EntitlementAppLimits;
  featureFlags: Record<string, boolean>;
  modules: string[] | null;
  /** The assigned package id, or null when the tenant has none (free default). */
  packageId: string | null;
}
