// ── Platform settings + tenant credential overrides ───────────────────────
// Backed by core.platform_settings via @engenty/platform-settings. Secret
// settings are write-only: the server never returns their value, only whether
// one is set and where the effective value currently resolves from.

import { requestApiJson } from "@engenty/api-client";

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
  return requestApiJson<PlatformSettingsListResponse>(
    "/api/platform-settings",
    {
      signal,
    }
  );
}

export function setPlatformSetting(key: string, value: string) {
  return requestApiJson<{ setting: PlatformSettingView }>(
    `/api/platform-settings/${encodeURIComponent(key)}`,
    { method: "PATCH", body: { value } }
  );
}

export function deletePlatformSetting(key: string) {
  return requestApiJson<{ setting: PlatformSettingView }>(
    `/api/platform-settings/${encodeURIComponent(key)}`,
    { method: "DELETE" }
  );
}

export function listTenantSettingOverrides(signal?: AbortSignal) {
  return requestApiJson<PlatformSettingsListResponse>(
    "/api/tenant-settings-overrides",
    { signal }
  );
}

export function setTenantSettingOverride(key: string, value: string) {
  return requestApiJson<{ setting: PlatformSettingView }>(
    `/api/tenant-settings-overrides/${encodeURIComponent(key)}`,
    { method: "PATCH", body: { value } }
  );
}

export function deleteTenantSettingOverride(key: string) {
  return requestApiJson<{ setting: PlatformSettingView }>(
    `/api/tenant-settings-overrides/${encodeURIComponent(key)}`,
    { method: "DELETE" }
  );
}
