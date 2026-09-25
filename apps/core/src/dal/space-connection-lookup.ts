/**
 * "Which accounts does this space own?" (PLAN-space-owned-connections.md).
 *
 * A connection belongs to one Space (`module_connections.connections.space_id`)
 * and every engenty of that Space uses it. Two things downstream still think
 * in CONNECTORS — the capability shape roles are scoped with
 * (`module.connections.write.<connectorId>`) and the AI-side space gate, which
 * recognises a connector operation by its tool prefix — so the surface carries
 * each owned account's connector next to its id.
 *
 * Cross-schema by design, and the same shape as `space-record-lookup.ts`: the
 * read runs on the tenant-locked handle and filters `tenant_id` regardless.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Undefined table; schema not exposed by PostgREST. */
const MODULE_ABSENT_CODES = new Set(["42P01", "PGRST106"]);

export interface SpaceOwnedConnection {
  connectorId: string;
  id: string;
  status: "active" | "error" | "revoked";
}

/**
 * Accounts this space owns, any status.
 *
 * Empty when the connections module is not installed (schema not exposed or
 * table missing): a space with no accounts is the normal case there, and
 * failing would break the surface endpoint every chat turn depends on. Any
 * other error throws — an empty answer would read as "this space owns nothing".
 */
export async function listSpaceOwnedConnections(
  client: SupabaseClient,
  tenantId: string,
  spaceId: string
): Promise<SpaceOwnedConnection[]> {
  const result = await client
    .schema("module_connections")
    .from("connections")
    .select("id, connector_id, status")
    .eq("tenant_id", tenantId)
    .eq("space_id", spaceId);
  if (result.error) {
    if (MODULE_ABSENT_CODES.has(result.error.code)) {
      return [];
    }
    throw result.error;
  }
  return (
    (result.data ?? []) as Array<{
      connector_id: string;
      id: string;
      status: string;
    }>
  ).map((row) => ({
    connectorId: row.connector_id,
    id: row.id,
    status:
      row.status === "active" || row.status === "error"
        ? row.status
        : "revoked",
  }));
}
