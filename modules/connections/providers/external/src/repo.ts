import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImportedConnectorRecord } from "./types.js";

const SCHEMA = "module_external_connectors";
const TABLE = "imported_connectors";

/**
 * DAL for imported connector records. The schema is service_role-only (no
 * `authenticated` grants) — all reads/writes flow through module routes and
 * boot-time registration, mirroring the connections token-table posture.
 */
export interface ExternalConnectorsRepo {
  delete(id: string): Promise<void>;
  get(id: string): Promise<ImportedConnectorRecord | null>;
  insert(record: ImportedConnectorRecord): Promise<void>;
  list(): Promise<ImportedConnectorRecord[]>;
  listEnabled(): Promise<ImportedConnectorRecord[]>;
  setStatus(id: string, status: "enabled" | "disabled"): Promise<void>;
  update(
    id: string,
    patch: Partial<
      Pick<
        ImportedConnectorRecord,
        | "actions"
        | "auth_config"
        | "base_url"
        | "client_id_enc"
        | "client_secret_enc"
        | "name"
        | "refreshed_at"
        | "spec_hash"
      >
    >
  ): Promise<void>;
}

export function createExternalConnectorsRepo(
  supabase: SupabaseClient
): ExternalConnectorsRepo {
  const table = () => supabase.schema(SCHEMA).from(TABLE);

  const throwOnError = <T extends { error: { message: string } | null }>(
    result: T,
    op: string
  ): T => {
    if (result.error) {
      throw new Error(
        `external-connectors ${op} failed: ${result.error.message}`
      );
    }
    return result;
  };

  return {
    async delete(id) {
      throwOnError(await table().delete().eq("id", id), "delete");
    },
    async get(id) {
      const result = throwOnError(
        await table().select("*").eq("id", id).maybeSingle(),
        "get"
      );
      return (result.data as ImportedConnectorRecord | null) ?? null;
    },
    async insert(record) {
      throwOnError(await table().insert(record), "insert");
    },
    async list() {
      const result = throwOnError(
        await table().select("*").order("imported_at", { ascending: true }),
        "list"
      );
      return (result.data as ImportedConnectorRecord[] | null) ?? [];
    },
    async listEnabled() {
      const result = throwOnError(
        await table()
          .select("*")
          .eq("status", "enabled")
          .order("imported_at", { ascending: true }),
        "listEnabled"
      );
      return (result.data as ImportedConnectorRecord[] | null) ?? [];
    },
    async setStatus(id, status) {
      throwOnError(await table().update({ status }).eq("id", id), "setStatus");
    },
    async update(id, patch) {
      throwOnError(await table().update(patch).eq("id", id), "update");
    },
  };
}
