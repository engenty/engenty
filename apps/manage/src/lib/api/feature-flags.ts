import { request } from "./http";

export interface FeatureFlagDefinition {
  default: boolean;
  descriptionKey?: string;
  key: string;
  labelKey?: string;
  namespace: string;
  pluginId: string;
}

export interface FeatureFlagsManageResponse {
  definitions: FeatureFlagDefinition[];
  global: Record<string, boolean>;
  resolved: Record<string, boolean>;
  tenant: Record<string, boolean>;
  tenantId: string | null;
}

export interface FeatureFlagUpdate {
  enabled: boolean;
  key: string;
  tenant_id: string | null;
}

export function getManageFlags(tenantId?: string, signal?: AbortSignal) {
  const query = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
  return request<FeatureFlagsManageResponse>(
    `/api/feature-flags/manage${query}`,
    { signal }
  );
}

export function saveFlagUpdates(updates: FeatureFlagUpdate[]) {
  return request<{ saved: true }>("/api/feature-flags/manage", {
    method: "PUT",
    body: { updates },
  });
}
