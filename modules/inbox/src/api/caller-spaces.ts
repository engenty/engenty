import {
  actorUserIdFromAuth,
  type PluginAuthContext,
} from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The Spaces whose mail this caller may see (PLAN-space-owned-connections.md).
 * A mailbox belongs to one Space; its mail is visible to that Space's members
 * and agents, nobody else.
 *
 * - **person**: the Spaces they own or are a member of — narrowed to the named
 *   Space when the call names one (naming a Space never widens past
 *   membership).
 * - **agent / service with a Space**: that Space (core stamps the run's Space).
 * - **agent / service without a Space**: none — a run that names no Space
 *   reaches no account.
 *
 * Throws when memberships cannot be read: answering with the tenant's mail
 * instead would be the leak this rule closes.
 */
export async function resolveCallerSpaceIds(
  db: SupabaseClient,
  auth: PluginAuthContext
): Promise<ReadonlySet<string>> {
  const spaceId = auth.spaceId?.trim() || null;
  const userId = actorUserIdFromAuth(auth);
  if (!userId) {
    return new Set(spaceId ? [spaceId] : []);
  }
  const memberships = await listUserSpaceIds(db, auth.tenantId, userId);
  if (!spaceId) {
    return memberships;
  }
  return new Set(memberships.has(spaceId) ? [spaceId] : []);
}

async function listUserSpaceIds(
  db: SupabaseClient,
  tenantId: string,
  userId: string
): Promise<Set<string>> {
  const [owned, member] = await Promise.all([
    db
      .schema("core")
      .from("spaces")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("owner_user_id", userId)
      .is("deleted_at", null),
    db
      .schema("core")
      .from("space_member")
      .select("space_id")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId),
  ]);
  if (owned.error) {
    throw new Error(`space memberships: ${owned.error.message}`);
  }
  if (member.error) {
    throw new Error(`space memberships: ${member.error.message}`);
  }
  return new Set([
    ...((owned.data ?? []) as Array<{ id: string }>).map((row) => row.id),
    ...((member.data ?? []) as Array<{ space_id: string }>).map(
      (row) => row.space_id
    ),
  ]);
}
