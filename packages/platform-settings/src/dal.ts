import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decryptSettingSecret,
  defaultSettingsKeyWrapper,
  encryptSettingSecret,
  type KeyWrapper,
} from "./crypto.js";
import type {
  PlatformSettingEntry,
  PlatformSettingInput,
  PlatformSettingRow,
  SettingScope,
} from "./types.js";

const SCHEMA = "core";
const TABLE = "platform_settings";

export type SettingsLogger = (message: string, error?: unknown) => void;

export interface PlatformSettingsRepoOptions {
  keyWrapper?: KeyWrapper;
  /** Called when a stored secret fails to decrypt (fail-closed: treated as unset). */
  logger?: SettingsLogger;
}

export type PlatformSettingsRepo = ReturnType<
  typeof createPlatformSettingsRepoSupabase
>;

export function createPlatformSettingsRepoSupabase(
  adapter: unknown,
  options: PlatformSettingsRepoOptions = {}
) {
  const supabase = adapter as SupabaseClient;
  const keyWrapper = options.keyWrapper ?? defaultSettingsKeyWrapper;
  const logger = options.logger;
  const table = () => supabase.schema(SCHEMA).from(TABLE);

  async function rowToEntry(
    row: PlatformSettingRow
  ): Promise<PlatformSettingEntry> {
    let value: PlatformSettingEntry["value"];
    switch (row.type) {
      case "string":
        value = row.value_string;
        break;
      case "numeric":
        value = row.value_numeric;
        break;
      case "boolean":
        value = row.value_boolean;
        break;
      case "json":
        value = (row.value_jsonb as Record<string, unknown> | null) ?? null;
        break;
      case "secret":
        value = await decryptOrNull(row);
        break;
      default:
        value = null;
    }
    return {
      name: row.name,
      type: row.type,
      value,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    };
  }

  async function decryptOrNull(
    row: PlatformSettingRow
  ): Promise<string | null> {
    if (!row.value_enc) {
      return null;
    }
    try {
      return await decryptSettingSecret({
        keyWrapper,
        scope: row.scope,
        tenantId: row.tenant_id,
        name: row.name,
        valueEnc: row.value_enc,
        dekId: row.dek_id,
      });
    } catch (error) {
      // Fail closed: a corrupt/mis-bound ciphertext is treated as unset so the
      // resolver falls through to env, never leaking a partial or wrong value.
      logger?.(
        `platform-settings: failed to decrypt ${row.scope}/${row.tenant_id ?? "-"}/${row.name}`,
        error
      );
      return null;
    }
  }

  async function buildRow(
    scope: SettingScope,
    tenantId: string | null,
    input: PlatformSettingInput
  ): Promise<Record<string, unknown>> {
    const row: Record<string, unknown> = {
      scope,
      tenant_id: tenantId,
      name: input.name,
      type: input.type,
      value_string: null,
      value_jsonb: null,
      value_numeric: null,
      value_boolean: null,
      value_enc: null,
      dek_id: null,
      updated_at: new Date().toISOString(),
      updated_by: input.updatedBy ?? null,
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
      case "secret": {
        const plain = input.secretValue ?? "";
        const { valueEnc, dekId } = await encryptSettingSecret({
          keyWrapper,
          scope,
          tenantId,
          name: input.name,
          plain,
        });
        row.value_enc = valueEnc;
        row.dek_id = dekId;
        break;
      }
      default:
        throw new Error(`Unsupported setting type: ${String(input.type)}`);
    }
    return row;
  }

  async function getOne(
    scope: SettingScope,
    tenantId: string | null,
    name: string
  ): Promise<PlatformSettingEntry | null> {
    let query = table().select("*").eq("scope", scope).eq("name", name);
    query =
      tenantId === null
        ? query.is("tenant_id", null)
        : query.eq("tenant_id", tenantId);
    const { data, error } = await query.maybeSingle();
    if (error || !data) {
      return null;
    }
    return rowToEntry(data as PlatformSettingRow);
  }

  async function listScope(
    scope: SettingScope,
    tenantId: string | null
  ): Promise<PlatformSettingEntry[]> {
    let query = table().select("*").eq("scope", scope);
    query =
      tenantId === null
        ? query.is("tenant_id", null)
        : query.eq("tenant_id", tenantId);
    const { data, error } = await query;
    if (error || !data) {
      return [];
    }
    return Promise.all(
      (data as PlatformSettingRow[]).map((row) => rowToEntry(row))
    );
  }

  async function upsert(
    scope: SettingScope,
    tenantId: string | null,
    input: PlatformSettingInput
  ): Promise<PlatformSettingEntry> {
    const row = await buildRow(scope, tenantId, input);
    // Update-or-insert by hand: platform rows have a NULL tenant_id, so the
    // uniqueness lives in partial indexes that PostgREST's onConflict cannot
    // target. Config writes are rare and admin-driven, so the tiny race here is
    // acceptable (last write wins, same as .upsert would give).
    let updateQuery = table()
      .update(row)
      .eq("scope", scope)
      .eq("name", input.name);
    updateQuery =
      tenantId === null
        ? updateQuery.is("tenant_id", null)
        : updateQuery.eq("tenant_id", tenantId);
    const { data: updated, error: updateError } = await updateQuery.select();
    if (updateError) {
      throw new Error(
        `Failed to save platform setting: ${updateError.message}`
      );
    }
    if (!updated || updated.length === 0) {
      const { error: insertError } = await table().insert(row);
      if (insertError) {
        throw new Error(
          `Failed to save platform setting: ${insertError.message}`
        );
      }
    }
    const result = await getOne(scope, tenantId, input.name);
    if (!result) {
      throw new Error("Failed to read back saved setting");
    }
    return result;
  }

  async function remove(
    scope: SettingScope,
    tenantId: string | null,
    name: string
  ): Promise<void> {
    let query = table().delete().eq("scope", scope).eq("name", name);
    query =
      tenantId === null
        ? query.is("tenant_id", null)
        : query.eq("tenant_id", tenantId);
    const { error } = await query;
    if (error) {
      throw new Error(`Failed to delete platform setting: ${error.message}`);
    }
  }

  return {
    getPlatform: (name: string) => getOne("platform", null, name),
    listPlatform: () => listScope("platform", null),
    setPlatform: (input: PlatformSettingInput) =>
      upsert("platform", null, input),
    deletePlatform: (name: string) => remove("platform", null, name),

    getTenantOverride: (tenantId: string, name: string) =>
      getOne("tenant", tenantId, name),
    listTenantOverrides: (tenantId: string) => listScope("tenant", tenantId),
    setTenantOverride: (tenantId: string, input: PlatformSettingInput) =>
      upsert("tenant", tenantId, input),
    deleteTenantOverride: (tenantId: string, name: string) =>
      remove("tenant", tenantId, name),
  };
}
