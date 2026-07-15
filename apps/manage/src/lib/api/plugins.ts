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

export type PluginLifecycleOperation =
  | "install"
  | "update"
  | "uninstall"
  | "reload";

export interface PluginLifecycleIssue {
  code: string;
  level: "error" | "info" | "warn";
  message: string;
}

/**
 * Preflight report for a lifecycle operation. Core returns a superset per kind
 * (reload → preflightPassed/steps, uninstall → removableAtRuntime, install →
 * installable); we read the common fields defensively and keep the rest.
 */
export interface PluginLifecycleReport {
  installable?: boolean;
  issues?: PluginLifecycleIssue[];
  migrationReviewRequired?: boolean;
  preflightPassed?: boolean;
  removableAtRuntime?: boolean;
  requiresRestart?: boolean;
  steps?: { id?: string; label?: string; status?: string }[];
  [key: string]: unknown;
}

/** Fetch the preflight report for a reload/uninstall/install operation. */
export function getPluginReport(
  id: string,
  kind: "reload" | "uninstall" | "install",
  signal?: AbortSignal
) {
  return request<PluginLifecycleReport>(
    `/api/plugins/${encodeURIComponent(id)}/${kind}-report`,
    { signal }
  );
}

/**
 * Run a lifecycle operation. Throws `ApiClientResponseError` on a blocked (409)
 * or failed (500) result; the caller surfaces `.message`. Package mutations
 * (install/update/uninstall) require `confirm_package_mutation`.
 */
export function runPluginLifecycle(
  id: string,
  operation: PluginLifecycleOperation,
  options: { packageSpec?: string } = {}
) {
  const body: Record<string, unknown> =
    operation === "reload"
      ? {}
      : {
          confirm_package_mutation: true,
          ...(options.packageSpec ? { package_spec: options.packageSpec } : {}),
        };
  return request<{ pluginId: string; status: string }>(
    `/api/plugins/${encodeURIComponent(id)}/${operation}`,
    { method: "POST", body }
  );
}
