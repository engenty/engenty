/**
 * Types for the platform + tenant settings store (core.platform_settings).
 *
 * Setting `name` is identical to the underlying env var key (e.g.
 * "AI_GATEWAY_API_KEY"), so resolution can fall back to `process.env[name]`
 * uniformly. Secrets live in `value_enc` (AES-256-GCM via @engenty/secrets-sdk,
 * AAD-bound to scope|tenant|name); everything else uses the typed value_* columns.
 */

export type SettingValueType =
  | "string"
  | "numeric"
  | "boolean"
  | "json"
  | "secret";

export type SettingScope = "platform" | "tenant";

/** At which scope a var may be overridden in the DB store (from the env manifest). */
export type SettingConfigurable = "platform" | "tenant";

export type SettingSource = "tenant" | "platform" | "env" | "default" | "unset";

export interface PlatformSettingRow {
  dek_id: string | null;
  name: string;
  scope: SettingScope;
  tenant_id: string | null;
  type: SettingValueType;
  updated_at: string;
  updated_by: string | null;
  value_boolean: boolean | null;
  value_enc: string | null;
  value_jsonb: unknown;
  value_numeric: number | null;
  value_string: string | null;
}

export type SettingValueOut =
  | string
  | number
  | boolean
  | Record<string, unknown>
  | null;

/** A stored setting with its plaintext value (secret decrypted, or null if undecryptable). */
export interface PlatformSettingEntry {
  name: string;
  type: SettingValueType;
  updatedAt: string;
  updatedBy: string | null;
  value: SettingValueOut;
}

export interface PlatformSettingInput {
  name: string;
  /** Plaintext secret; the repo encrypts it before storage (type must be "secret"). */
  secretValue?: string | null;
  type: SettingValueType;
  updatedBy?: string | null;
  value_boolean?: boolean | null;
  value_jsonb?: unknown;
  value_numeric?: number | null;
  value_string?: string | null;
}

/**
 * Precedence metadata for one configurable setting, derived from the env
 * manifest. The resolver reads these to know which keys have a tenant scope,
 * which are secrets, and their env-fallback default.
 */
export interface SettingSpec {
  configurable: SettingConfigurable;
  defaultValue?: string;
  key: string;
  secret: boolean;
  type: SettingValueType;
}
