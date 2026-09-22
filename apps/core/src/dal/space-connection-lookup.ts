/**
 * "Which connector does this mounted account belong to?" (PLAN-spaces.md
 * Phase CN.3).
 *
 * A connection mount names an ACCOUNT (`info@company.com`), but two things
 * downstream still think in CONNECTORS: the capability shape CON-02 scopes
 * roles with (`module.connections.write.<connectorId>`), and the AI-side space
 * gate, which recognises a connector operation by its tool prefix. Neither can
 * be derived from a connection id without asking the connections module, so
 * this is where core asks.
 *
 * Cross-schema by design, and the same shape as `space-record-lookup.ts`: the
 * read runs on the tenant-locked handle and filters `tenant_id` regardless, so
 * a mount pointing at another tenant's connection resolves to nothing rather
 * than to that tenant's connector. An id that resolves to nothing is simply
 * absent from the map — a mount whose account was deleted grants no connector,
 * which is the correct direction to fail in.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

// Connection ids reach this from `space_mount.resource_key`, which is free text
// — pre-CN.3 rows hold connector ids like `google-gmail`. Those are not UUIDs
// and would make PostgREST raise `invalid input syntax for type uuid` for the
// whole batch, so they are filtered out here rather than caught downstream.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Connector id per connection id, for the ids that exist in this tenant.
 *
 * Returns an empty map rather than throwing when the connections module is not
 * installed: a space that mounts no accounts is the normal case for an install
 * without connections, and a 42P01 there would break the surface endpoint that
 * every chat turn depends on.
 */
export async function resolveConnectorIdsForConnections(
  client: SupabaseClient,
  tenantId: string,
  connectionIds: readonly string[]
): Promise<Map<string, string>> {
  const facts = await resolveConnectionFacts(client, tenantId, connectionIds);
  return new Map(
    [...facts].map(([id, connection]) => [id, connection.connectorId])
  );
}

/**
 * What core needs to know about an account before placing it in a space
 * (PLAN-connections-ux.md C1/C3): who owns it — a member may place their OWN
 * account without being an admin — and how far its owner already lets engentys
 * go with it, so the level being set can raise that ceiling rather than being
 * quietly capped by it.
 *
 * Read, never written, from here. The account's own columns stay the
 * connections module's to change: raising the ceiling goes back through its
 * owner-checked operation, so a placement cannot become a way around ownership.
 */
export interface SpaceConnectionFacts {
  autonomousMode: "off" | "read_only" | "full";
  connectorId: string;
  ownerUserId: string | null;
  sharing: "personal" | "org";
}

export async function resolveConnectionFacts(
  client: SupabaseClient,
  tenantId: string,
  connectionIds: readonly string[]
): Promise<Map<string, SpaceConnectionFacts>> {
  const ids = [...new Set(connectionIds)].filter((id) => UUID_PATTERN.test(id));
  if (ids.length === 0) {
    return new Map();
  }
  const result = await client
    .schema("module_connections")
    .from("connections")
    .select("id, connector_id, owner_user_id, sharing, autonomous_mode")
    .eq("tenant_id", tenantId)
    .in("id", ids);
  if (result.error) {
    return new Map();
  }
  const rows = (result.data ?? []) as Array<{
    autonomous_mode: string;
    connector_id: string;
    id: string;
    owner_user_id: string | null;
    sharing: string;
  }>;
  return new Map(
    rows.map((row) => [
      row.id,
      {
        autonomousMode:
          row.autonomous_mode === "full" || row.autonomous_mode === "read_only"
            ? row.autonomous_mode
            : "off",
        connectorId: row.connector_id,
        ownerUserId: row.owner_user_id,
        sharing: row.sharing === "org" ? "org" : "personal",
      } satisfies SpaceConnectionFacts,
    ])
  );
}

/** Connector ids of accounts flagged for every space in this tenant. */
export async function listAllSpacesConnectorIds(
  client: SupabaseClient,
  tenantId: string
): Promise<string[]> {
  const result = await client
    .schema("module_connections")
    .from("connections")
    .select("connector_id")
    .eq("tenant_id", tenantId)
    .eq("all_spaces", true)
    .eq("status", "active");
  if (result.error) {
    return [];
  }
  return [
    ...new Set(
      ((result.data ?? []) as Array<{ connector_id: string }>).map(
        (row) => row.connector_id
      )
    ),
  ];
}
