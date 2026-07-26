import { request } from "./http";

export type EntitlementEnforcementMode = "observe" | "enforce";

export interface EntitlementAiUsagePolicy {
  /**
   * Licensed effort tiers. This is the grant a commercial plan should use —
   * unlike a model-id list it never goes stale when a vendor ships something.
   */
  allowed_efforts: string[] | null;
  allowed_models: string[] | null;
  /** Provider allow-list; additive with allowed_models. null/empty = any. */
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

export interface EntitlementPackage {
  aiUsagePolicy: EntitlementAiUsagePolicy;
  appLimits: EntitlementAppLimits;
  featureFlags: Record<string, boolean>;
  id: string;
  label: string;
  modules: string[] | null;
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

export interface TenantEntitlements {
  override: EntitlementOverride | null;
  packageId: string | null;
  packages: EntitlementPackage[];
  resolved: ResolvedEntitlements;
  tenantId: string;
}

export function listPackages(signal?: AbortSignal) {
  return request<{ packages: EntitlementPackage[] }>(
    "/api/superadmin/packages",
    { signal }
  ).then((r) => r.packages);
}

export function getPackage(id: string, signal?: AbortSignal) {
  return request<EntitlementPackage>(
    `/api/superadmin/packages/${encodeURIComponent(id)}`,
    { signal }
  );
}

export function syncPackageDefaults() {
  return request<{ upserted: number }>(
    "/api/superadmin/packages/sync-defaults",
    { method: "POST" }
  );
}

export function restorePackageDefaults() {
  return request<{ restored: number }>(
    "/api/superadmin/packages/restore-defaults",
    { method: "POST" }
  );
}

export function getTenantEntitlements(tenantId: string, signal?: AbortSignal) {
  return request<TenantEntitlements>(
    `/api/superadmin/tenants/${encodeURIComponent(tenantId)}/entitlements`,
    { signal }
  );
}

/**
 * Assigning a package re-materializes `ai.tenant_usage_policy`. That propagation
 * used to fail silently, leaving the tenant on a stale allow-list while the UI
 * showed the new plan — `policySynced` is how the caller can tell.
 */
export function setTenantPackage(tenantId: string, packageId: string | null) {
  return request<{
    packageId: string | null;
    policySyncError?: string;
    policySynced: boolean;
    tenantId: string;
  }>(`/api/superadmin/tenants/${encodeURIComponent(tenantId)}/package`, {
    method: "PUT",
    body: { packageId },
  });
}

export function setTenantOverride(
  tenantId: string,
  override: EntitlementOverride
) {
  return request<{
    override: EntitlementOverride;
    policySyncError?: string;
    policySynced: boolean;
    tenantId: string;
  }>(
    `/api/superadmin/tenants/${encodeURIComponent(tenantId)}/entitlement-override`,
    { method: "PUT", body: override }
  );
}

export function clearTenantOverride(tenantId: string) {
  return request<{
    cleared: boolean;
    policySyncError?: string;
    policySynced: boolean;
    tenantId: string;
  }>(
    `/api/superadmin/tenants/${encodeURIComponent(tenantId)}/entitlement-override`,
    { method: "DELETE" }
  );
}

/**
 * Roll a package's current policy out to every tenant already on it. Editing a
 * package otherwise only affects tenants assigned to it afterwards.
 */
export function reapplyPackagePolicies(packageId: string) {
  return request<{
    failures: { message: string; tenantId: string }[];
    packageId: string;
    reapplied: number;
  }>(`/api/superadmin/packages/${encodeURIComponent(packageId)}/reapply`, {
    method: "POST",
  });
}
