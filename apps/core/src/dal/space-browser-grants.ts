/**
 * `core.space_browser_grants` — a Space's standing consent for ITS browser
 * (PLAN-user-browser.md D3; PLAN-space-owned-connections.md). One row per
 * Space: the browser is the Space's, shared by its agents, and so is the
 * consent.
 *
 * Two facts: `unattended` — may an agent drive the Space's logged-in browser
 * while nobody is watching (attended turns never ask; headless runs stop
 * with `needs_user` unless it is true) — and `autostart` — may an agent START
 * the browser without asking when nobody started one (off: the agent asks in
 * the chat and waits). Reads and writes go through the tenant-locked handle
 * like every other core table.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SpaceBrowserGrant {
  autostart: boolean;
  spaceId: string;
  unattended: boolean;
  updatedAt: string;
}

interface SpaceBrowserGrantRow {
  autostart: boolean;
  space_id: string;
  unattended: boolean;
  updated_at: string;
}

const COLUMNS = "space_id, unattended, autostart, updated_at";

function mapRow(row: SpaceBrowserGrantRow): SpaceBrowserGrant {
  return {
    autostart: row.autostart === true,
    spaceId: row.space_id,
    unattended: row.unattended === true,
    updatedAt: row.updated_at,
  };
}

/** The grant row, or null when the Space never set one (= not unattended). */
export async function getSpaceBrowserGrant(
  client: SupabaseClient,
  tenantId: string,
  spaceId: string
): Promise<SpaceBrowserGrant | null> {
  const { data, error } = await client
    .schema("core")
    .from("space_browser_grants")
    .select(COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("space_id", spaceId)
    .maybeSingle();
  if (error) {
    throw new Error(`space_browser_grants select: ${error.message}`);
  }
  return data ? mapRow(data as SpaceBrowserGrantRow) : null;
}

/** Patch: an omitted flag keeps what the row has (false when there is no row). */
export async function upsertSpaceBrowserGrant(
  client: SupabaseClient,
  tenantId: string,
  spaceId: string,
  input: { autostart?: boolean; unattended?: boolean; updatedBy: string }
): Promise<SpaceBrowserGrant> {
  const current = await getSpaceBrowserGrant(client, tenantId, spaceId);
  const { data, error } = await client
    .schema("core")
    .from("space_browser_grants")
    .upsert(
      {
        autostart: input.autostart ?? current?.autostart ?? false,
        space_id: spaceId,
        tenant_id: tenantId,
        unattended: input.unattended ?? current?.unattended ?? false,
        updated_at: new Date().toISOString(),
        updated_by: input.updatedBy,
      },
      { onConflict: "tenant_id,space_id" }
    )
    .select(COLUMNS)
    .single();
  if (error) {
    throw new Error(`space_browser_grants upsert: ${error.message}`);
  }
  return mapRow(data as SpaceBrowserGrantRow);
}
