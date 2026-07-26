import { requestAi } from "./http";

/**
 * The materialized `ai.tenant_usage_policy` row — what enforcement actually
 * reads, as opposed to the entitlement package it was derived from.
 *
 * These superadmin routes existed but no manage UI called them, which left a
 * real hole: once a policy is `managed_by: 'entitlement'` the tenant-facing
 * PATCH answers 409, so a tenant whose materialized row drifted from its package
 * (a swallowed propagation failure, a hand-edited allow-list) could not be
 * corrected from anywhere in the product. This is that path.
 */
export type UsageEnforcementMode = "observe" | "enforce";
export type UsagePolicyManagedBy = "tenant" | "entitlement";

export interface TenantUsagePolicy {
  allowed_models: string[] | null;
  allowed_providers: string[] | null;
  currency: string;
  enforcement_mode: UsageEnforcementMode;
  hard_limit_cost_micros: number | null;
  included_cost_micros: number | null;
  managed_by: UsagePolicyManagedBy;
  period_mode: "calendar" | "rolling";
  period_unit: "day" | "week" | "month";
  soft_limit_cost_micros: number | null;
  tenant_id: string;
  tier: string;
  updated_at: string;
}

/** Fields the admin route accepts; omitted keys are left untouched. */
export interface TenantUsagePolicyPatch {
  allowed_models?: string[] | null;
  allowed_providers?: string[] | null;
  enforcement_mode?: UsageEnforcementMode;
  hard_limit_cost_micros?: number | null;
  soft_limit_cost_micros?: number | null;
}

export function getTenantUsagePolicy(tenantId: string, signal?: AbortSignal) {
  return requestAi<TenantUsagePolicy>(
    `/ai/v1/usage/admin/${encodeURIComponent(tenantId)}/policy`,
    { signal }
  );
}

export function patchTenantUsagePolicy(
  tenantId: string,
  patch: TenantUsagePolicyPatch
) {
  return requestAi<TenantUsagePolicy>(
    `/ai/v1/usage/admin/${encodeURIComponent(tenantId)}/policy`,
    { method: "PATCH", body: patch }
  );
}
