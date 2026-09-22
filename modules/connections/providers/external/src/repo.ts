import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImportedConnectorRecord } from "./types.js";

const SCHEMA = "module_external_connectors";
const TABLE = "imported_connectors";

/**
 * DAL for imported connector records. Tenant-scoped: boot still lists every
 * tenant (service lane) so definitions can register under `${tenantId}::${id}`;
 * request routes filter by the caller's tenant.
 */
export interface ExternalConnectorsRepo {
  delete(tenantId: string, id: string): Promise<void>;
  /** The existing import of a registry surface, if the domain already has one. */
  findByRegistrySurface(
    tenantId: string,
    domain: string,
    slug: string
  ): Promise<ImportedConnectorRecord | null>;
  get(tenantId: string, id: string): Promise<ImportedConnectorRecord | null>;
  insert(record: ImportedConnectorRecord): Promise<void>;
  list(tenantId: string): Promise<ImportedConnectorRecord[]>;
  /** Boot: every enabled import across tenants. */
  listEnabled(): Promise<ImportedConnectorRecord[]>;
  setStatus(
    tenantId: string,
    id: string,
    status: "enabled" | "disabled"
  ): Promise<void>;
  update(
    tenantId: string,
    id: string,
    patch: Partial<
      Pick<
        ImportedConnectorRecord,
        | "actions"
        | "auth_config"
        | "base_url"
        | "client_id_enc"
        | "client_secret_enc"
        | "mcp_transport"
        | "name"
        | "refreshed_at"
        | "required_headers"
        | "spec_hash"
      >
    >
  ): Promise<void>;
}

/**
 * Rows written before the registry-surface migration have no
 * `required_headers` / `mcp_transport` / `registry_surface_slug`. They keep
 * booting and executing: the defaults here are exactly what those imports
 * meant — a URL import with no registry surface and no required headers.
 */
function toRecord(row: unknown): ImportedConnectorRecord {
  const record = row as ImportedConnectorRecord;
  return {
    ...record,
    mcp_transport: record.mcp_transport ?? null,
    registry_surface_slug: record.registry_surface_slug ?? null,
    required_headers: record.required_headers ?? [],
  };
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
    async delete(tenantId, id) {
      throwOnError(
        await table().delete().eq("tenant_id", tenantId).eq("id", id),
        "delete"
      );
    },
    async findByRegistrySurface(tenantId, domain, slug) {
      const result = throwOnError(
        await table()
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("domain", domain)
          .eq("registry_surface_slug", slug)
          .maybeSingle(),
        "findByRegistrySurface"
      );
      return result.data ? toRecord(result.data) : null;
    },
    async get(tenantId, id) {
      const result = throwOnError(
        await table()
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("id", id)
          .maybeSingle(),
        "get"
      );
      return result.data ? toRecord(result.data) : null;
    },
    async insert(record) {
      throwOnError(await table().insert(record), "insert");
    },
    async list(tenantId) {
      const result = throwOnError(
        await table()
          .select("*")
          .eq("tenant_id", tenantId)
          .order("imported_at", { ascending: true }),
        "list"
      );
      return ((result.data as unknown[] | null) ?? []).map(toRecord);
    },
    async listEnabled() {
      const result = throwOnError(
        await table()
          .select("*")
          .eq("status", "enabled")
          .order("imported_at", { ascending: true }),
        "listEnabled"
      );
      return ((result.data as unknown[] | null) ?? []).map(toRecord);
    },
    async setStatus(tenantId, id, status) {
      throwOnError(
        await table().update({ status }).eq("tenant_id", tenantId).eq("id", id),
        "setStatus"
      );
    },
    async update(tenantId, id, patch) {
      throwOnError(
        await table().update(patch).eq("tenant_id", tenantId).eq("id", id),
        "update"
      );
    },
  };
}
