/**
 * User settings KV store types.
 * Keys use dot-namespaced convention, e.g. appearance.language, appearance.theme_mode
 */
export type UserSettingType = "string" | "numeric" | "boolean" | "json";

export interface UserSettingRow {
  name: string;
  type: UserSettingType;
  updated_at: string;
  user_id: string;
  value_boolean: boolean | null;
  value_jsonb: unknown;
  value_numeric: number | null;
  value_string: string | null;
}

export interface UserSettingValue {
  name: string;
  type: UserSettingType;
  value_boolean?: boolean | null;
  value_jsonb?: unknown;
  value_numeric?: number | null;
  value_string?: string | null;
}

export type UserSettingValueOut =
  | string
  | number
  | boolean
  | Record<string, unknown>
  | null;
