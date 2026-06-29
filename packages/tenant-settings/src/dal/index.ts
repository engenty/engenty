import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  TenantSettingRow,
  TenantSettingType,
  TenantSettingValue,
  TenantSettingValueOut,
} from "../types.js";

const SCHEMA = "core";
const TABLE = "tenant_settings";

export type TenantSettingsRepoSupabase = ReturnType<
  typeof createTenantSettingsRepoSupabase
>;

export function createTenantSettingsRepoSupabase(
  adapter: unknown,
  tenantId: string,
  scopeId: string
) {
  const supabase = adapter as SupabaseClient;
  const table = () => supabase.schema(SCHEMA).from(TABLE);

  function rowToValue(row: TenantSettingRow): TenantSettingValueOut {
    switch (row.type) {
      case "string":
        return row.value_string;
      case "numeric":
        return row.value_numeric;
      case "boolean":
        return row.value_boolean;
      case "json":
        return row.value_jsonb as Record<string, unknown> | null;
      default:
        return null;
    }
  }

  function rowToEntry(row: TenantSettingRow) {
    return { name: row.name, type: row.type, value: rowToValue(row) };
  }

  function buildRow(input: TenantSettingValue): Record<string, unknown> {
    const row: Record<string, unknown> = {
      tenant_id: tenantId,
      scope_id: scopeId,
      name: input.name,
      type: input.type,
      value_string: null,
      value_jsonb: null,
      value_numeric: null,
      value_boolean: null,
      updated_at: new Date().toISOString(),
    };

    switch (input.type) {
      case "string":
        row.value_string = input.value_string ?? "";
        break;
      case "numeric":
        row.value_numeric = input.value_numeric ?? 0;
        break;
      case "boolean":
        row.value_boolean = input.value_boolean ?? false;
        break;
      case "json":
        row.value_jsonb = input.value_jsonb ?? {};
        break;
      default:
        throw new Error(
          `Unsupported setting type: ${(input as { type: string }).type}`
        );
    }
    return row;
  }

  return {
    async get(name: string): Promise<{
      name: string;
      type: TenantSettingType;
      value: TenantSettingValueOut;
    } | null> {
      const { data, error } = await table()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("name", name)
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      return rowToEntry(data as TenantSettingRow);
    },

    /**
     * List all settings for this tenant+scope in one query. Pass a
     * dot-namespaced `prefix` (e.g. "appearance.") to fetch a domain at once.
     */
    async list(prefix?: string): Promise<
      Array<{
        name: string;
        type: TenantSettingType;
        value: TenantSettingValueOut;
      }>
    > {
      let query = table()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);
      if (prefix) {
        query = query.like("name", `${prefix}%`);
      }
      const { data, error } = await query;
      if (error || !data) {
        return [];
      }
      return (data as TenantSettingRow[]).map(rowToEntry);
    },

    async set(input: TenantSettingValue): Promise<{
      name: string;
      type: TenantSettingType;
      value: TenantSettingValueOut;
    }> {
      const { error } = await table()
        .upsert(buildRow(input), { onConflict: "tenant_id,scope_id,name" })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to save tenant setting: ${error.message}`);
      }

      const result = await this.get(input.name);
      if (!result) {
        throw new Error("Failed to read back saved setting");
      }
      return result;
    },

    /** Upsert many settings in a single round trip. */
    async setMany(inputs: TenantSettingValue[]): Promise<
      Array<{
        name: string;
        type: TenantSettingType;
        value: TenantSettingValueOut;
      }>
    > {
      if (inputs.length === 0) {
        return [];
      }

      const { error } = await table()
        .upsert(inputs.map(buildRow), { onConflict: "tenant_id,scope_id,name" })
        .select();

      if (error) {
        throw new Error(`Failed to save tenant settings: ${error.message}`);
      }

      const names = inputs.map((input) => input.name);
      const { data } = await table()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .in("name", names);

      return ((data as TenantSettingRow[]) ?? []).map(rowToEntry);
    },
  };
}
