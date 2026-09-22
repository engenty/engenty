/**
 * `core.user_browser_grants` — a person's standing consent for THEIR browser
 * (PLAN-user-browser.md D3). One row per person in the tenant: the browser
 * is theirs in every space and outside any, and so is the consent.
 *
 * Two facts: `unattended` — may an agent drive this person's logged-in
 * browser while they are not at the keyboard (attended turns never ask;
 * headless runs stop with `needs_user` unless it is true) — and `autostart`
 * — may an agent START the browser without asking when the person never
 * started one (off: the agent asks in the chat and waits). Reads and writes
 * go through the tenant-locked handle like every other core table.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface UserBrowserGrant {
  autostart: boolean;
  unattended: boolean;
  updatedAt: string;
  userId: string;
}

interface UserBrowserGrantRow {
  autostart: boolean;
  unattended: boolean;
  updated_at: string;
  user_id: string;
}

const COLUMNS = "user_id, unattended, autostart, updated_at";

function mapRow(row: UserBrowserGrantRow): UserBrowserGrant {
  return {
    autostart: row.autostart === true,
    unattended: row.unattended === true,
    updatedAt: row.updated_at,
    userId: row.user_id,
  };
}

/** The grant row, or null when the person never set one (= not unattended). */
export async function getUserBrowserGrant(
  client: SupabaseClient,
  tenantId: string,
  userId: string
): Promise<UserBrowserGrant | null> {
  const { data, error } = await client
    .schema("core")
    .from("user_browser_grants")
    .select(COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(`user_browser_grants select: ${error.message}`);
  }
  return data ? mapRow(data as UserBrowserGrantRow) : null;
}

/** Patch: an omitted flag keeps what the row has (false when there is no row). */
export async function upsertUserBrowserGrant(
  client: SupabaseClient,
  tenantId: string,
  userId: string,
  input: { autostart?: boolean; unattended?: boolean }
): Promise<UserBrowserGrant> {
  const current = await getUserBrowserGrant(client, tenantId, userId);
  const { data, error } = await client
    .schema("core")
    .from("user_browser_grants")
    .upsert(
      {
        autostart: input.autostart ?? current?.autostart ?? false,
        tenant_id: tenantId,
        unattended: input.unattended ?? current?.unattended ?? false,
        updated_at: new Date().toISOString(),
        user_id: userId,
      },
      { onConflict: "tenant_id,user_id" }
    )
    .select(COLUMNS)
    .single();
  if (error) {
    throw new Error(`user_browser_grants upsert: ${error.message}`);
  }
  return mapRow(data as UserBrowserGrantRow);
}
