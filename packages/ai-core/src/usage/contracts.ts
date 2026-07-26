/**
 * AI usage metering contracts shared between ai-core, host stores, and API routes.
 *
 * Cost is stored in **integer micros** of the policy currency (1 USD = 1_000_000 micros).
 * Token snapshots on each event keep historical lines reproducible after pricing changes.
 */

export type UsageFeature =
  | "copilot"
  | "action"
  | "inbound"
  | "headless"
  | "agent_once"
  | "other";

export type UsagePeriodMode = "calendar" | "rolling";
export type UsagePeriodUnit = "day" | "week" | "month";
export type UsageEnforcementMode = "observe" | "enforce";

/** Sentinel uuid representing the tenant-wide rollup row in period totals. */
export const TENANT_AGGREGATE_USER_ID = "00000000-0000-0000-0000-000000000000";

export interface UsageTokenInput {
  cached?: number | null;
  input?: number | null;
  output?: number | null;
  reasoning?: number | null;
}

export interface ModelPricingRecord {
  cached_input_per_mtok_micros: number;
  created_at: string;
  currency: string;
  id: string;
  input_per_mtok_micros: number;
  model_id: string;
  output_per_mtok_micros: number;
  reasoning_per_mtok_micros: number;
  valid_from: string;
  valid_to: string | null;
}

export interface UsageEventRecord {
  action_id: string | null;
  agent_id: string | null;
  cached_input_per_mtok_micros: number;
  cached_tokens: number;
  cost_micros: number;
  created_at: string;
  currency: string;
  feature: UsageFeature;
  id: string;
  input_per_mtok_micros: number;
  input_tokens: number;
  model_id: string;
  occurred_at: string;
  output_per_mtok_micros: number;
  output_tokens: number;
  pricing_version_id: string | null;
  reasoning_per_mtok_micros: number;
  reasoning_tokens: number;
  request_id: string | null;
  run_id: string | null;
  tenant_id: string | null;
  thread_id: string | null;
  user_id: string | null;
}

export interface UsagePeriodTotalRecord {
  cached_tokens: number;
  cost_micros: number;
  currency: string;
  event_count: number;
  input_tokens: number;
  last_event_at: string | null;
  output_tokens: number;
  period_end: string;
  period_start: string;
  reasoning_tokens: number;
  tenant_id: string;
  updated_at: string;
  user_id: string;
}

/**
 * Who owns a tenant's usage policy.
 * - `tenant`: self-service (open-source / self-hosted default). The tenant admin
 *   edits limits + allow-list via `PATCH /ai/v1/usage/policy`.
 * - `entitlement`: centrally governed. The policy is materialized from the
 *   tenant's entitlement package/override (`applyAiUsagePolicy`); tenant-facing
 *   writes are rejected (409 `policy_managed`). superadmin admin-routes still
 *   write (that IS the manage-app path).
 */
export type UsagePolicyManagedBy = "tenant" | "entitlement";

export interface TenantUsagePolicyRecord {
  /** Licensed effort tiers; null/empty = all. */
  allowed_efforts: string[] | null;
  allowed_models: string[] | null;
  /**
   * Provider allow-list matched against `ai.gateway_model.provider`.
   * null/empty = unrestricted. Additive with {@link allowed_models}.
   */
  allowed_providers: string[] | null;
  created_at: string;
  currency: string;
  enforcement_mode: UsageEnforcementMode;
  hard_limit_cost_micros: number | null;
  included_cost_micros: number | null;
  included_input_tokens: number | null;
  included_output_tokens: number | null;
  managed_by: UsagePolicyManagedBy;
  period_anchor: string | null;
  period_mode: UsagePeriodMode;
  period_unit: UsagePeriodUnit;
  soft_limit_cost_micros: number | null;
  tenant_id: string;
  tier: string;
  updated_at: string;
}

export interface UserUsagePolicyRecord {
  created_at: string;
  max_cost_micros: number | null;
  max_total_tokens: number | null;
  tenant_id: string;
  updated_at: string;
  user_id: string;
}

/** Default policy applied when no row exists for a tenant. */
export const DEFAULT_TENANT_USAGE_POLICY: Omit<
  TenantUsagePolicyRecord,
  "tenant_id" | "created_at" | "updated_at"
> = {
  tier: "free",
  period_mode: "calendar",
  period_unit: "month",
  period_anchor: null,
  included_input_tokens: null,
  included_output_tokens: null,
  included_cost_micros: null,
  hard_limit_cost_micros: null,
  soft_limit_cost_micros: null,
  allowed_models: null,
  allowed_providers: null,
  allowed_efforts: null,
  enforcement_mode: "observe",
  currency: "usd",
  managed_by: "tenant",
};
