import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  UserSettingRow,
  UserSettingType,
  UserSettingValue,
  UserSettingValueOut,
} from "../types.js";

const SCHEMA = "core";
const TABLE = "user_settings";

export type UserSettingsRepoSupabase = ReturnType<
  typeof createUserSettingsRepoSupabase
>;

export function createUserSettingsRepoSupabase(
  adapter: unknown,
  userId: string,
  /** Stamped on writes; required since core.user_settings gained tenant_id
   * (20260809230000). The composite FK pins it to the owning user's tenant. */
  tenantId: string
) {
  const supabase = adapter as SupabaseClient;
  const table = () => supabase.schema(SCHEMA).from(TABLE);

  function rowToValue(row: UserSettingRow): UserSettingValueOut {
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

  function rowToEntry(row: UserSettingRow) {
    return { name: row.name, type: row.type, value: rowToValue(row) };
  }

  function buildRow(input: UserSettingValue): Record<string, unknown> {
    const row: Record<string, unknown> = {
      user_id: userId,
      tenant_id: tenantId,
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
      type: UserSettingType;
      value: UserSettingValueOut;
    } | null> {
      const { data, error } = await table()
        .select("*")
        .eq("user_id", userId)
        .eq("name", name)
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      return rowToEntry(data as UserSettingRow);
    },

    /**
     * List all of the user's settings in one query. Pass a dot-namespaced
     * `prefix` (e.g. "appearance.") to fetch a single domain's keys at once.
     */
    async list(prefix?: string): Promise<
      Array<{
        name: string;
        type: UserSettingType;
        value: UserSettingValueOut;
      }>
    > {
      let query = table().select("*").eq("user_id", userId);
      if (prefix) {
        query = query.like("name", `${prefix}%`);
      }
      const { data, error } = await query;
      if (error || !data) {
        return [];
      }
      return (data as UserSettingRow[]).map(rowToEntry);
    },

    async set(input: UserSettingValue): Promise<{
      name: string;
      type: UserSettingType;
      value: UserSettingValueOut;
    }> {
      const { error } = await table()
        .upsert(buildRow(input), { onConflict: "user_id,name" })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to save user setting: ${error.message}`);
      }

      const result = await this.get(input.name);
      if (!result) {
        throw new Error("Failed to read back saved setting");
      }
      return result;
    },

    /** Upsert many settings in a single round trip. */
    async setMany(inputs: UserSettingValue[]): Promise<
      Array<{
        name: string;
        type: UserSettingType;
        value: UserSettingValueOut;
      }>
    > {
      if (inputs.length === 0) {
        return [];
      }

      const { error } = await table()
        .upsert(inputs.map(buildRow), { onConflict: "user_id,name" })
        .select();

      if (error) {
        throw new Error(`Failed to save user settings: ${error.message}`);
      }

      const names = inputs.map((input) => input.name);
      const { data } = await table()
        .select("*")
        .eq("user_id", userId)
        .in("name", names);

      return ((data as UserSettingRow[]) ?? []).map(rowToEntry);
    },

    async delete(name: string): Promise<void> {
      const { error } = await table()
        .delete()
        .eq("user_id", userId)
        .eq("name", name);
      if (error) {
        throw new Error(`Failed to delete user setting: ${error.message}`);
      }
    },
  };
}
