import {
  getCurrentAccessToken,
  requestApiBlob,
  requestApiJson,
} from "@engenty/api-client";
import type { UiPluginSummary } from "@engenty/ui-plugin-sdk";
import { config } from "../config";

interface RequestOptions {
  authToken?: string;
  body?: unknown;
  headers?: Record<string, string>;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  signal?: AbortSignal;
}

export async function request<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = "GET", body, headers, signal, authToken } = options;
  const sessionToken = authToken || undefined;
  return await requestApiJson<T>(path, {
    baseUrl: config.apiBaseUrl,
    method,
    body: body as
      | BodyInit
      | Record<string, unknown>
      | unknown[]
      | null
      | undefined,
    headers,
    signal,
    ...(sessionToken ? { authToken: sessionToken } : {}),
  });
}

/** Authenticated file bytes — same base URL and token as {@link request}. */
export async function requestBlob(
  path: string,
  options: Pick<RequestOptions, "authToken" | "signal"> = {}
): Promise<Blob> {
  const { signal, authToken } = options;
  const sessionToken = authToken || undefined;
  return await requestApiBlob(path, {
    baseUrl: config.apiBaseUrl,
    signal,
    ...(sessionToken ? { authToken: sessionToken } : {}),
  });
}

export async function requestAiJson<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const baseUrl = config.aiBaseUrl.trim().replace(/\/$/, "");
  if (!baseUrl) {
    throw new Error("Missing VITE_ENGENTY_AI_BASE_URL");
  }
  const { method = "GET", body, headers, signal, authToken } = options;
  const token = authToken || (await getCurrentAccessToken());
  return await requestApiJson<T>(path, {
    baseUrl,
    method,
    body: body as
      | BodyInit
      | Record<string, unknown>
      | unknown[]
      | null
      | undefined,
    headers,
    signal,
    ...(token ? { authToken: token } : {}),
  });
}

interface OpenApiResponse {
  info?: {
    title?: string;
    version?: string;
  };
  paths?: Record<string, unknown>;
}

export function getOpenApi(signal?: AbortSignal) {
  return requestApiJson<OpenApiResponse>("/api/openapi.json", {
    baseUrl: config.apiBaseUrl,
    signal,
    unwrapEnvelope: false,
  });
}

export function getPlugins(signal?: AbortSignal, tenantId?: string | null) {
  const q = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
  return request<UiPluginSummary[]>(`/api/plugins${q}`, { signal });
}

export type PluginListItem = UiPluginSummary & {
  name: string;
  description?: string;
  version?: string;
  kind?: string;
  sourceType: "module" | "package";
  source: string;
  rootDir: string;
  packageName?: string;
  manifestPath: string;
  dependencies?: string[];
  effectiveState?: {
    allowed: boolean;
    blockedReasons: string[];
    capabilityAvailable: boolean;
    dependencies?: Array<{
      dependency: string;
      pluginId?: string;
      reason?: string;
      satisfied: boolean;
    }>;
    dependencySatisfied: boolean;
    globallyEnabled: boolean;
    loaded: boolean;
    state: string;
    tenantEnabled: boolean;
  };
  globalEnabled?: boolean;
  loadError?: string;
  mandatory?: boolean;
  mandatoryReason?: string;
  optional?: string[];
  provides?: string[];
  requires?: string[];
  tenantOverride?: boolean | null;
  tenantEnabled?: boolean;
  ui?: {
    assetOrigins?: string[];
    enabled?: boolean;
    entry: string;
    export?: string;
    load?: "runtime" | "workspace";
    staticAssets?: string[];
  };
  routesCount: number;
  servicesCount: number;
  methodsCount: number;
  operationsCount?: number;
  diagnosticsCount: number;
  dbHealth?: "healthy" | "degraded" | "down" | "unknown";
};

export interface PluginDiagnostic {
  level: "warn" | "error";
  message: string;
  pluginId?: string;
  source?: string;
}

export interface PluginDetailItem {
  cliCommands: string[];
  description?: string;
  diagnostics: PluginDiagnostic[];
  enabled: boolean;
  gatewayMethods: string[];
  httpRoutes: string[];
  id: string;
  kind?: string;
  loadError?: string;
  loaded: boolean;
  manifestPath: string;
  moduleOperations: string[];
  name?: string;
  packageName?: string;
  rootDir: string;
  services: string[];
  source: string;
  sourceType: "module" | "package";
  ui?: {
    enabled?: boolean;
    entry: string;
    export?: string;
  };
  version?: string;
}

export interface PluginStateMutationResponse {
  enabled: boolean;
  message: string;
  ok: true;
  pluginId: string;
  restartRequired: boolean;
  updatedAt: string;
}

export interface PluginReloadUiRefresh {
  generationId?: number;
  invalidationRequired: boolean;
  pluginId: string;
  reason: "ui_contributions_may_have_changed";
}

export interface PluginReloadResponse {
  pluginId: string;
  status: "blocked" | "failed" | "reloaded";
  uiRefresh?: PluginReloadUiRefresh;
}

export function getPluginsDetailed(
  signal?: AbortSignal,
  tenantId?: string | null
) {
  const q = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
  return request<PluginListItem[]>(`/api/plugins${q}`, { signal });
}

export function getPluginDetail(id: string, signal?: AbortSignal) {
  return request<PluginDetailItem>(`/api/plugins/${id}`, {
    signal,
  });
}

export function activatePlugin(id: string, tenantId?: string | null) {
  return request<PluginStateMutationResponse>(`/api/plugins/${id}/activate`, {
    method: "POST",
    body: tenantId ? { tenant_id: tenantId } : {},
  });
}

export function deactivatePlugin(id: string, tenantId?: string | null) {
  return request<PluginStateMutationResponse>(`/api/plugins/${id}/deactivate`, {
    method: "POST",
    body: tenantId ? { tenant_id: tenantId } : {},
  });
}

export function reloadPlugin(id: string, tenantId?: string | null) {
  return request<PluginReloadResponse>(`/api/plugins/${id}/reload`, {
    method: "POST",
    body: tenantId ? { tenant_id: tenantId } : {},
  });
}

export interface FeatureFlagDefinition {
  default: boolean;
  descriptionKey?: string;
  key: string;
  labelKey?: string;
  namespace: string;
  pluginId: string;
}

export interface FeatureFlagsCatalogResponse {
  definitions: FeatureFlagDefinition[];
  grouped: Record<string, FeatureFlagDefinition[]>;
}

export interface FeatureFlagsResolvedResponse {
  resolved: Record<string, boolean>;
}

export interface FeatureFlagsManageResponse {
  definitions: FeatureFlagDefinition[];
  global: Record<string, boolean>;
  resolved: Record<string, boolean>;
  tenant: Record<string, boolean>;
  tenantId: string | null;
}

export function getFeatureFlagsCatalog(signal?: AbortSignal) {
  return request<FeatureFlagsCatalogResponse>("/api/feature-flags/catalog", {
    signal,
  });
}

export function getFeatureFlagsResolved(signal?: AbortSignal) {
  return request<FeatureFlagsResolvedResponse>("/api/feature-flags/resolved", {
    signal,
  });
}

export function getFeatureFlagsManage(
  tenantId?: string | null,
  signal?: AbortSignal
) {
  const q = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
  return request<FeatureFlagsManageResponse>(`/api/feature-flags/manage${q}`, {
    signal,
  });
}

export function setFeatureFlagsOverrides(
  updates: Array<{ key: string; tenant_id?: string | null; enabled: boolean }>
) {
  return request<{ ok: boolean }>("/api/feature-flags/manage", {
    method: "PUT",
    body: { updates },
  });
}

// Tenant settings (KV store)
export interface TenantSettingResponse {
  name: string;
  type: "string" | "numeric" | "boolean" | "json";
  value: string | number | boolean | Record<string, unknown> | null;
}

export function getTenantSetting(name: string, signal?: AbortSignal) {
  return request<TenantSettingResponse | { error: string }>(
    `/api/tenant-settings/${encodeURIComponent(name)}`,
    { signal }
  );
}

export function setTenantSetting(
  name: string,
  input: {
    type: "string" | "numeric" | "boolean" | "json";
    value_string?: string | null;
    value_jsonb?: unknown;
    value_numeric?: number | null;
    value_boolean?: boolean | null;
  }
) {
  return request<TenantSettingResponse>(
    `/api/tenant-settings/${encodeURIComponent(name)}`,
    {
      method: "PATCH",
      body: input,
    }
  );
}

// User settings (global KV store)
export interface UserSettingResponse {
  name: string;
  type: "string" | "numeric" | "boolean" | "json";
  value: string | number | boolean | Record<string, unknown> | null;
}

export function getUserSetting(name: string, signal?: AbortSignal) {
  return request<UserSettingResponse | { error: string }>(
    `/api/user-settings/${encodeURIComponent(name)}`,
    { signal }
  );
}

export function setUserSetting(
  name: string,
  input: {
    type: "string" | "numeric" | "boolean" | "json";
    value_string?: string | null;
    value_jsonb?: unknown;
    value_numeric?: number | null;
    value_boolean?: boolean | null;
  }
) {
  return request<UserSettingResponse>(
    `/api/user-settings/${encodeURIComponent(name)}`,
    {
      method: "PATCH",
      body: input,
    }
  );
}

// --- Batch / collection helpers (one request for many keys) ---

export interface SettingValueInput {
  type: "string" | "numeric" | "boolean" | "json";
  value_boolean?: boolean | null;
  value_jsonb?: unknown;
  value_numeric?: number | null;
  value_string?: string | null;
}

export interface SettingsListResponse {
  settings: Array<{
    name: string;
    type: "string" | "numeric" | "boolean" | "json";
    value: string | number | boolean | Record<string, unknown> | null;
  }>;
}

function settingsCollectionPath(base: string, prefix?: string): string {
  return prefix ? `${base}?prefix=${encodeURIComponent(prefix)}` : base;
}

/** Read all (or prefix-filtered) tenant settings in one request. */
export function getTenantSettings(prefix?: string, signal?: AbortSignal) {
  return request<SettingsListResponse>(
    settingsCollectionPath("/api/tenant-settings", prefix),
    { signal }
  );
}

/** Upsert many tenant settings in one request. */
export function setTenantSettings(
  settings: Array<SettingValueInput & { name: string }>
) {
  return request<SettingsListResponse>("/api/tenant-settings", {
    method: "PATCH",
    body: { settings },
  });
}

// ── Platform settings + tenant credential overrides ───────────────────────
// Backed by core.platform_settings via @engenty/platform-settings. Secret
// settings are write-only: the server never returns their value, only whether
// one is set and where the effective value currently resolves from.

export interface PlatformSettingObtain {
  generator?: string;
  instructions?: string[];
  kind: string;
  statusKeys?: string[];
  url?: string;
}

export interface PlatformSettingView {
  configurable: "platform" | "tenant";
  description: string;
  feature?: string;
  group: string;
  /** A DB row exists at this scope (env is overridden here). */
  isSet: boolean;
  key: string;
  obtain: PlatformSettingObtain;
  required: "always" | "feature" | "optional";
  secret: boolean;
  /** Which layer supplies the effective value: tenant|platform|env|default|unset. */
  source: string;
  type: "string" | "numeric" | "boolean" | "json" | "secret";
  updatedAt: string | null;
  updatedBy: string | null;
  /** Present for non-secret settings only. */
  value?: string | null;
}

/** Install-wide facts the setup UI shows alongside the settings themselves. */
export interface PlatformSettingsContext {
  /** Public origin of this installation ("" when no base URL is configured). */
  apiBaseUrl: string;
  /** Loopback alternative to offer when the redirect host is unusable. */
  loopbackRedirectUri: string | null;
  /** Redirect/callback URL to register with every OAuth provider. */
  oauthRedirectUri: string | null;
  /** The redirect host is one providers refuse (a `*.localhost` subdomain). */
  redirectHostRejected: boolean;
}

/**
 * Deploy-scope keys the UI can only report on: they are read from each
 * service's own process environment, never from the settings store.
 */
export interface DeploymentEnvVar {
  description: string;
  feature?: string;
  group: string;
  /** Non-empty in the server's environment. Values are never returned. */
  isSet: boolean;
  key: string;
  required: "always" | "feature" | "optional";
  secret: boolean;
}

export interface PlatformSettingsListResponse {
  context?: PlatformSettingsContext;
  deploymentEnv?: DeploymentEnvVar[];
  settings: PlatformSettingView[];
}

export function listPlatformSettings(signal?: AbortSignal) {
  return request<PlatformSettingsListResponse>("/api/platform-settings", {
    signal,
  });
}

export function setPlatformSetting(key: string, value: string) {
  return request<{ setting: PlatformSettingView }>(
    `/api/platform-settings/${encodeURIComponent(key)}`,
    { method: "PATCH", body: { value } }
  );
}

export function deletePlatformSetting(key: string) {
  return request<{ setting: PlatformSettingView }>(
    `/api/platform-settings/${encodeURIComponent(key)}`,
    { method: "DELETE" }
  );
}

export function listTenantSettingOverrides(signal?: AbortSignal) {
  return request<PlatformSettingsListResponse>(
    "/api/tenant-settings-overrides",
    { signal }
  );
}

export function setTenantSettingOverride(key: string, value: string) {
  return request<{ setting: PlatformSettingView }>(
    `/api/tenant-settings-overrides/${encodeURIComponent(key)}`,
    { method: "PATCH", body: { value } }
  );
}

export function deleteTenantSettingOverride(key: string) {
  return request<{ setting: PlatformSettingView }>(
    `/api/tenant-settings-overrides/${encodeURIComponent(key)}`,
    { method: "DELETE" }
  );
}

/** Read all (or prefix-filtered) user settings in one request. */
export function getUserSettings(prefix?: string, signal?: AbortSignal) {
  return request<SettingsListResponse>(
    settingsCollectionPath("/api/user-settings", prefix),
    { signal }
  );
}

/** Upsert many user settings in one request. */
export function setUserSettings(
  settings: Array<SettingValueInput & { name: string }>
) {
  return request<SettingsListResponse>("/api/user-settings", {
    method: "PATCH",
    body: { settings },
  });
}

export interface WorkspaceTenant {
  id: string;
  name: string;
  slug: string;
}

export interface ResolvedAppearance {
  chatStyle?: string;
  colorBackground?: string;
  colorBlind?: string;
  colorPrimary?: string;
  colorSecondary?: string;
  contrast?: string;
  font: string;
  fontSize: string;
  /** Unset when nobody chose one — the browser's language stands. */
  language?: string;
  layoutMode?: string;
  sidebarColor?: string;
  sidebarMode?: string;
  sidebarVisibility?: string;
  tenantContrast?: string;
  themeMode: string;
}

export interface WorkspaceContextResponse {
  canSwitchTenant: boolean;
  /** The space the user is working in — the tenant's default until the rail can switch. */
  currentSpace: { id: string; key: string; name: string } | null;
  currentTenant: WorkspaceTenant | null;
  currentUser: {
    display_name: string | null;
    email: string | null;
    id: string;
    initials: string | null;
    role: "admin" | "member" | null;
  };
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
  onboarded: boolean;
  /** Commercial package label, or "local" when none is assigned. */
  planLabel: string;
  resolvedAppearance: ResolvedAppearance;
  /** BCP-47 tags from tenant `i18n.supported_locales` (comma-separated); defaults `en`,`de`. */
  tenantRole: "admin" | "member" | null;
  tenantSupportedLocales: string[];
  tenants: WorkspaceTenant[];
  userId: string;
}

export function getWorkspaceContext(signal?: AbortSignal) {
  return request<WorkspaceContextResponse>("/api/users/setup/context", {
    signal,
  });
}

export function switchCurrentTenant(tenantId: string) {
  return request<{ ok: true; tenantId: string }>(
    `/api/superadmin/tenants/${encodeURIComponent(tenantId)}/switch`,
    {
      method: "POST",
    }
  );
}

export type SuperadminTenant = WorkspaceTenant & {
  tenant_connection_mode: "shared_instance" | "dedicated_instance";
  created_at: string;
  updated_at: string;
};

export interface SuperadminUser {
  created_at: string;
  display_name: string | null;
  email: string;
  id: string;
  is_super_admin: boolean;
  role: "admin" | "member";
  tenant_id: string;
  tenant_role?: "admin" | "member";
  updated_at: string;
}

export function listSuperadminTenants(signal?: AbortSignal) {
  return request<SuperadminTenant[]>("/api/superadmin/tenants", {
    signal,
  });
}

export function createSuperadminTenant(input: {
  slug: string;
  name: string;
  tenant_connection_mode?: "shared_instance" | "dedicated_instance";
}) {
  return request<SuperadminTenant>("/api/superadmin/tenants", {
    method: "POST",
    body: input,
  });
}

export function updateSuperadminTenant(
  id: string,
  input: Partial<
    Pick<SuperadminTenant, "slug" | "name" | "tenant_connection_mode">
  >
) {
  return request<SuperadminTenant>(
    `/api/superadmin/tenants/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: input,
    }
  );
}

export function listSuperadminUsers(tenantId?: string, signal?: AbortSignal) {
  const q = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
  return request<SuperadminUser[]>(`/api/superadmin/users${q}`, { signal });
}

export function assignUserToTenant(
  tenantId: string,
  userId: string,
  role: "admin" | "member"
) {
  return request<{ assigned: true }>(
    `/api/superadmin/tenants/${encodeURIComponent(tenantId)}/users`,
    {
      method: "POST",
      body: { userId, role },
    }
  );
}

export function updateTenantUserRole(
  tenantId: string,
  userId: string,
  role: "admin" | "member"
) {
  return request<{ updated: true }>(
    `/api/superadmin/tenants/${encodeURIComponent(tenantId)}/users/${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      body: { role },
    }
  );
}

export interface TestDataType {
  data_type: string;
  description: string | null;
  module_id: string;
  plugin_id: string;
}

export function getTestDataTypes(signal?: AbortSignal) {
  return request<TestDataType[]>("/api/test-data/types", {
    signal,
  });
}

export interface GenerateTestDataInput {
  count?: number;
  data_type: string;
  instructions?: string;
  module_id: string;
}

export interface GenerateTestDataResponse {
  created_count: number;
  ok: true;
  sample: Record<string, unknown> | null;
  warnings: string[];
}

export function generateTestData(input: GenerateTestDataInput) {
  return request<GenerateTestDataResponse>("/api/test-data/generate", {
    method: "POST",
    body: {
      module_id: input.module_id,
      data_type: input.data_type,
      count: input.count ?? 10,
      instructions: input.instructions ?? "",
    },
  });
}

export function removeUserFromTenant(tenantId: string, userId: string) {
  return request<{ removed: true }>(
    `/api/superadmin/tenants/${encodeURIComponent(tenantId)}/users/${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
    }
  );
}

// Audit logs (tenant-scoped when tenantId provided)
export interface AuditLogEvent {
  actor_id: string | null;
  detail: Record<string, unknown>;
  id: string;
  module_id: string | null;
  operation_id: string | null;
  source_component: string | null;
  source_kind: "core" | "module";
  source_module_id: string | null;
  tenant_id: string | null;
  timestamp: string;
  type: string;
}

export interface AuditLogFiltersParams {
  actor_id?: string;
  date_from?: Date;
  date_to?: Date;
  module_id?: string;
  search?: string;
  types?: string[];
}

export interface AuditLogFilterOptions {
  module_ids: string[];
  types: string[];
}

export function getAuditEvents(
  params: {
    filters?: AuditLogFiltersParams;
    page?: number;
    limit?: number;
    tenantId?: string | null;
  },
  signal?: AbortSignal
) {
  const { filters = {}, page = 0, limit = 50, tenantId } = params;
  const q = new URLSearchParams();
  q.set("limit", String(limit));
  q.set("page", String(page));
  if (tenantId) {
    q.set("tenant_id", tenantId);
  }
  if (filters.search) {
    q.set("search", filters.search);
  }
  if (filters.types?.length) {
    q.set("types", filters.types.join(","));
  }
  if (filters.actor_id) {
    q.set("actor_id", filters.actor_id);
  }
  if (filters.module_id) {
    q.set("module_id", filters.module_id);
  }
  if (filters.date_from) {
    q.set("from", filters.date_from.toISOString());
  }
  if (filters.date_to) {
    q.set("to", filters.date_to.toISOString());
  }
  return request<{
    events: AuditLogEvent[];
    has_more: boolean;
    total: number;
  }>(`/api/security/audit/events?${q.toString()}`, { signal });
}

export function getAuditFilterOptions(
  tenantId?: string | null,
  signal?: AbortSignal
) {
  const q = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : "";
  return request<AuditLogFilterOptions>(`/api/security/audit/distincts${q}`, {
    signal,
  });
}

// ---------------------------------------------------------------------------
// Tenant-side AI usage & limits
// ---------------------------------------------------------------------------

export interface AiUsagePeriodTotals {
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

export interface AiUsageBreakdownByModelRow {
  cached_tokens: number;
  cost_micros: number;
  event_count: number;
  feature: string;
  input_tokens: number;
  model_id: string;
  output_tokens: number;
  reasoning_tokens: number;
}

export interface AiUsageBreakdownByUserRow {
  cached_tokens: number;
  cost_micros: number;
  event_count: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  user_display_name: string | null;
  user_email: string | null;
  user_id: string | null;
}

export interface AiUsageMeResponse {
  breakdown_by_model: AiUsageBreakdownByModelRow[];
  currency: string;
  enforcement_mode: "observe" | "enforce";
  hard_limit_cost_micros: number | null;
  period_end: string;
  period_mode: "calendar" | "rolling";
  period_start: string;
  period_unit: "day" | "week" | "month";
  remaining_cost_micros: number | null;
  soft_limit_cost_micros: number | null;
  tenant_totals: AiUsagePeriodTotals | null;
  user_totals: AiUsagePeriodTotals | null;
}

export interface AiUsageTenantResponse extends AiUsageMeResponse {
  breakdown_by_user: AiUsageBreakdownByUserRow[];
  tenant_id: string;
}

export interface AiUsageTenantPolicy {
  allowed_models: string[] | null;
  created_at: string;
  currency: string;
  enforcement_mode: "observe" | "enforce";
  hard_limit_cost_micros: number | null;
  included_cost_micros: number | null;
  included_input_tokens: number | null;
  included_output_tokens: number | null;
  period_anchor: string | null;
  period_mode: "calendar" | "rolling";
  period_unit: "day" | "week" | "month";
  soft_limit_cost_micros: number | null;
  tenant_id: string;
  tier: string;
  updated_at: string;
}

export function getAiUsageMe(signal?: AbortSignal) {
  return requestAiJson<AiUsageMeResponse>("/ai/v1/usage/me", { signal });
}

export function getAiUsageTenant(signal?: AbortSignal) {
  return requestAiJson<AiUsageTenantResponse>("/ai/v1/usage/tenant", {
    signal,
  });
}

export function getAiUsagePolicy(signal?: AbortSignal) {
  return requestAiJson<AiUsageTenantPolicy>("/ai/v1/usage/policy", {
    signal,
  });
}

export function patchAiUsagePolicy(patch: {
  period_mode?: "calendar" | "rolling";
  period_unit?: "day" | "week" | "month";
  period_anchor?: string | null;
}) {
  return requestAiJson<AiUsageTenantPolicy>("/ai/v1/usage/policy", {
    method: "PATCH",
    body: patch,
  });
}
