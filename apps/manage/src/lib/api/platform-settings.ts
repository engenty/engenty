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

export function listPlatformSettings(signal?: AbortSignal) {
  return request<{ settings: PlatformSettingView[] }>(
    "/api/platform-settings",
    {
      signal,
    }
  );
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
