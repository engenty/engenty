import { request } from "./http";

/** Mirrors the UI client types for `GET /api/platform-settings`. */
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
