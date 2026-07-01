import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ScopedKvContext,
  ScopedKvSettingRow,
  TenantSettingType,
  TenantSettingValue,
  TenantSettingValueOut,
} from "../types.js";

export type ScopedKvSettingsRepoSupabase = ReturnType<
  typeof createScopedKvSettingsRepoSupabase
>;

export interface CreateScopedKvSettingsRepoOptions {
  adapter: unknown;
  schema: string;
  scopeId: string;
  table: string;
  tenantId: string;
}

function rowToValue(row: ScopedKvSettingRow): TenantSettingValueOut {
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

function toRowPayload(
  tenantId: string,
  scopeId: string,
  context: ScopedKvContext,
  input: TenantSettingValue
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    tenant_id: tenantId,
    scope_id: scopeId,
    context,
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

export function scopedKvContextFilterValue(context: ScopedKvContext): string {
  return JSON.stringify(context);
}

/**
 * Typed KV settings with optional JSON `context` (same columns as `core.tenant_settings` + `context`).
 * Primary key: `(tenant_id, scope_id, context, name)`.
 */
export function createScopedKvSettingsRepoSupabase(
  options: CreateScopedKvSettingsRepoOptions
) {
  const { adapter, schema, table, tenantId, scopeId } = options;
  const supabase = adapter as SupabaseClient;
  const tbl = () => supabase.schema(schema).from(table);

  return {
    async get(
      context: ScopedKvContext,
      name: string
    ): Promise<{
      context: ScopedKvContext;
      name: string;
      type: TenantSettingType;
      value: TenantSettingValueOut;
    } | null> {
      const { data, error } = await tbl()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("context", scopedKvContextFilterValue(context))
        .eq("name", name)
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      const row = data as ScopedKvSettingRow;
      return {
        context: row.context ?? {},
        name: row.name,
        type: row.type,
        value: rowToValue(row),
      };
    },

    async set(
      context: ScopedKvContext,
      input: TenantSettingValue
    ): Promise<{
      context: ScopedKvContext;
      name: string;
      type: TenantSettingType;
      value: TenantSettingValueOut;
    }> {
      const row = toRowPayload(tenantId, scopeId, context, input);
      const { error } = await tbl()
        .upsert(row, {
          onConflict: "tenant_id,scope_id,context,name",
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to save scoped setting: ${error.message}`);
      }

      const result = await this.get(context, input.name);
      if (!result) {
        throw new Error("Failed to read back saved setting");
      }
      return result;
    },

    /**
     * All rows for this tenant + scope, optionally filtered by exact `context` and/or `name` prefix.
     */
    async list(filters?: {
      context?: ScopedKvContext;
      namePrefix?: string;
    }): Promise<
      Array<{
        context: ScopedKvContext;
        name: string;
        type: TenantSettingType;
        value: TenantSettingValueOut;
      }>
    > {
      let q = tbl()
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId);
      if (filters?.context !== undefined) {
        q = q.eq("context", scopedKvContextFilterValue(filters.context));
      }
      if (filters?.namePrefix !== undefined && filters.namePrefix !== "") {
        q = q.like("name", `${filters.namePrefix.replace(/%/g, "\\%")}%`);
      }
      const { data, error } = await q;
      if (error) {
        throw new Error(`Failed to list scoped settings: ${error.message}`);
      }
      return (data ?? []).map((raw) => {
        const row = raw as ScopedKvSettingRow;
        return {
          context: row.context ?? {},
          name: row.name,
          type: row.type,
          value: rowToValue(row),
        };
      });
    },

    async delete(context: ScopedKvContext, name: string): Promise<void> {
      const { error } = await tbl()
        .delete()
        .eq("tenant_id", tenantId)
        .eq("scope_id", scopeId)
        .eq("context", scopedKvContextFilterValue(context))
        .eq("name", name);
      if (error) {
        throw new Error(`Failed to delete scoped setting: ${error.message}`);
      }
    },
  };
}
