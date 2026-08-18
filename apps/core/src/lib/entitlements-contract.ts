/** Open-side contract for commercial entitlements (closed package optional). */

export type EntitlementEnforcementMode = "observe" | "enforce";

export interface EntitlementAiUsagePolicy {
  allowed_efforts: string[] | null;
  allowed_models: string[] | null;
  allowed_providers: string[] | null;
  currency: string;
  enforcement_mode: EntitlementEnforcementMode;
  hard_limit_cost_micros: number | null;
  included_cost_micros: number | null;
  period_mode: "calendar" | "rolling";
  period_unit: "day" | "week" | "month";
  soft_limit_cost_micros: number | null;
}

export interface EntitlementAppLimits {
  enforcement_mode: EntitlementEnforcementMode;
  maxUsers: number | null;
}

export interface EntitlementPricing {
  base_micros: number;
  currency: string;
  includedUsers: number | null;
  perExtraUser_micros: number;
}

export interface EntitlementPackage {
  aiUsagePolicy: EntitlementAiUsagePolicy;
  appLimits: EntitlementAppLimits;
  featureFlags: Record<string, boolean>;
  id: string;
  label: string;
  modules: string[] | null;
  pricing?: EntitlementPricing;
  version: number;
}

export interface EntitlementOverride {
  aiUsagePolicy?: Partial<EntitlementAiUsagePolicy>;
  appLimits?: Partial<EntitlementAppLimits>;
  featureFlags?: Record<string, boolean>;
  modules?: string[] | null;
}

export interface ResolvedEntitlements {
  aiUsagePolicy: EntitlementAiUsagePolicy;
  appLimits: EntitlementAppLimits;
  featureFlags: Record<string, boolean>;
  modules: string[] | null;
  packageId: string | null;
}

export interface BillingUsage {
  aiCostMicros: number;
  userCount: number;
}

export type EntitlementPackagePatch = Partial<{
  aiUsagePolicy: EntitlementAiUsagePolicy;
  appLimits: EntitlementAppLimits;
  featureFlags: Record<string, boolean>;
  label: string;
  modules: string[] | null;
}>;
