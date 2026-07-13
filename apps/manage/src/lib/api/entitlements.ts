import { request } from "./http";

export type EntitlementEnforcementMode = "observe" | "enforce";

export interface EntitlementAiUsagePolicy {
  allowed_models: string[] | null;
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

export function setTenantPackage(tenantId: string, packageId: string | null) {
  return request<{ tenantId: string; packageId: string | null }>(
    `/api/superadmin/tenants/${encodeURIComponent(tenantId)}/package`,
    { method: "PUT", body: { packageId } }
  );
}

export function setTenantOverride(
  tenantId: string,
  override: EntitlementOverride
) {
  return request<{ tenantId: string; override: EntitlementOverride }>(
    `/api/superadmin/tenants/${encodeURIComponent(tenantId)}/entitlement-override`,
    { method: "PUT", body: override }
  );
}

export function clearTenantOverride(tenantId: string) {
  return request<{ tenantId: string; cleared: boolean }>(
    `/api/superadmin/tenants/${encodeURIComponent(tenantId)}/entitlement-override`,
    { method: "DELETE" }
  );
}
