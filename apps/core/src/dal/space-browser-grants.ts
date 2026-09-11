/**
 * `core.space_browser_grants` — a person's standing consent for THEIR browser
 * in a space (PLAN-user-browser.md D3).
 *
 * Two facts: `unattended` — may an agent drive this person's logged-in
 * browser while they are not at the keyboard (attended turns never ask;
 * headless runs stop with `needs_user` unless it is true) — and `autostart`
 * — may an agent START the browser without asking when the person never
 * started one here (off: the agent asks in the chat and waits). Reads and
 * writes go through the tenant-locked handle like every other space table.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SpaceBrowserGrant {
  autostart: boolean;
  spaceId: string;
  unattended: boolean;
  updatedAt: string;
  userId: string;
}

interface SpaceBrowserGrantRow {
  autostart: boolean;
  space_id: string;
  unattended: boolean;
  updated_at: string;
  user_id: string;
}

const COLUMNS = "space_id, user_id, unattended, autostart, updated_at";

function mapRow(row: SpaceBrowserGrantRow): SpaceBrowserGrant {
  return {
    autostart: row.autostart === true,
    spaceId: row.space_id,
    unattended: row.unattended === true,
    updatedAt: row.updated_at,
    userId: row.user_id,
  };
}

/** The grant row, or null when the person never set one (= not unattended). */
export async function getSpaceBrowserGrant(
  client: SupabaseClient,
  tenantId: string,
  spaceId: string,
  userId: string
): Promise<SpaceBrowserGrant | null> {
  const { data, error } = await client
    .schema("core")
    .from("space_browser_grants")
    .select(COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("space_id", spaceId)
    .eq("user_id", userId)
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
  userId: string,
  input: { autostart?: boolean; unattended?: boolean }
): Promise<SpaceBrowserGrant> {
  const current = await getSpaceBrowserGrant(client, tenantId, spaceId, userId);
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
        user_id: userId,
      },
      { onConflict: "tenant_id,space_id,user_id" }
    )
    .select(COLUMNS)
    .single();
  if (error) {
    throw new Error(`space_browser_grants upsert: ${error.message}`);
  }
  return mapRow(data as SpaceBrowserGrantRow);
}
