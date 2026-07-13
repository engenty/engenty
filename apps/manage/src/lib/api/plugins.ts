import { request } from "./http";

export interface PluginEffectiveState {
  allowed: boolean;
  blockedReasons?: string[];
  tenantEnabled?: boolean;
}

export interface PluginListItem {
  dependencies?: string[];
  diagnosticsCount: number;
  effectiveState: PluginEffectiveState;
  enabled: boolean;
  globalEnabled: boolean;
  id: string;
  loadError?: string | null;
  loaded: boolean;
  mandatory: boolean;
  name: string;
  packageName?: string;
  sourceType?: string;
  tenantOverride: boolean | null;
  version?: string;
}

export interface PluginDetail extends PluginListItem {
  manifestPath?: string;
  methodsCount?: number;
  operationsCount?: number;
  routesCount?: number;
  servicesCount?: number;
  source?: string;
}

export function listPlugins(tenantId?: string, signal?: AbortSignal) {
  const query = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
  return request<PluginListItem[]>(`/api/plugins${query}`, { signal });
}

export function getPlugin(id: string, signal?: AbortSignal) {
  return request<PluginDetail>(`/api/plugins/${encodeURIComponent(id)}`, {
    signal,
  });
}

/**
 * Toggle a plugin globally, or per-tenant when `tenantId` is given. Throws
 * `ApiClientResponseError` on the 409 `plugin.tenant_activation.blocked`; the
 * caller reads `details.blockedReasons` off it.
 */
export function setPluginEnabled(
  id: string,
  enabled: boolean,
  tenantId?: string
) {
  const action = enabled ? "activate" : "deactivate";
  return request<{ pluginId: string; enabled: boolean }>(
    `/api/plugins/${encodeURIComponent(id)}/${action}`,
    {
      method: "POST",
      body: tenantId ? { tenant_id: tenantId } : {},
    }
  );
}
