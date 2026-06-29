/**
 * Tenant settings KV store types.
 * Keys use dot-namespaced convention, e.g. appearance.theme_mode
 */
export type TenantSettingType = "string" | "numeric" | "boolean" | "json";

export interface TenantSettingRow {
  name: string;
  scope_id: string;
  tenant_id: string;
  type: TenantSettingType;
  updated_at: string;
  value_boolean: boolean | null;
  value_jsonb: unknown;
  value_numeric: number | null;
  value_string: string | null;
}

export interface TenantSettingValue {
  name: string;
  type: TenantSettingType;
  value_boolean?: boolean | null;
  value_jsonb?: unknown;
  value_numeric?: number | null;
  value_string?: string | null;
}

export type TenantSettingValueOut =
  | string
  | number
  | boolean
  | Record<string, unknown>
  | null;
