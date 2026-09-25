/**
 * A Space's side of connections: which plugins are enabled on it (`plugin`
 * mounts, before any account exists) and which accounts it owns.
 */
import { capabilityCovers } from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Connector ids enabled on this space (`plugin` mounts). Null when the
 * space's mounts could not be read.
 */
export async function listMountedPluginIds(
  client: SupabaseClient,
  tenantId: string,
  spaceId: string
): Promise<Set<string> | null> {
  const result = await client
    .schema("core")
    .from("space_mount")
    .select("resource_key")
    .eq("tenant_id", tenantId)
    .eq("space_id", spaceId)
    .eq("resource_type", "plugin");
  if (result.error) {
    return null;
  }
  return new Set(
    ((result.data ?? []) as Array<{ resource_key: string }>).map(
      (row) => row.resource_key
    )
  );
}

/**
 * Enable a plugin on a space before anyone authenticates an account.
 * `resource_key` is the connector id. Idempotent.
 */
export async function mountPluginInSpace(
  client: SupabaseClient,
  params: { connectorId: string; spaceId: string; tenantId: string }
): Promise<boolean> {
  const result = await client.schema("core").from("space_mount").upsert(
    {
      is_required: false,
      resource_key: params.connectorId,
      resource_type: "plugin",
      space_id: params.spaceId,
      tenant_id: params.tenantId,
    },
    { onConflict: "tenant_id,space_id,resource_type,resource_key" }
  );
  if (result.error) {
    throw new Error(result.error.message);
  }
  return true;
}

/**
 * The account filter a module should apply to its RECORDS in this run (mail,
 * files, calendar entries kept against an account):
 *
 * - **no space named** → `null`, do not narrow (tenant-level callers such as
 *   settings pages; record visibility then rests on the module's own rules).
 * - **space named** → the ids of the accounts that Space owns. An EMPTY set is
 *   a decision: that space has no records of this kind.
 *
 * Throws when the accounts cannot be read — answering with the tenant's
 * records instead would be the leak this exists to close.
 */
export async function resolveSpaceRecordAccounts(
  client: SupabaseClient,
  params: { spaceId?: string | null; tenantId: string }
): Promise<ReadonlySet<string> | null> {
  const spaceId = params.spaceId?.trim();
  if (!spaceId) {
    return null;
  }
  const result = await client
    .schema("module_connections")
    .from("connections")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("space_id", spaceId);
  if (result.error) {
    throw new Error(`space accounts: ${result.error.message}`);
  }
  return new Set(
    ((result.data ?? []) as Array<{ id: string }>).map((row) => row.id)
  );
}

export interface SpaceAccessEntry {
  isOwner: boolean;
}

/** Every Space a user may enter, keyed by id. */
export type SpaceAccessMap = ReadonlyMap<string, SpaceAccessEntry>;

/**
 * Every Space this user may enter, keyed by id, with whether they own it.
 *
 * Core's rule for `/s/<key>`, stated once for connection code: you may enter
 * a Space iff it is open, you own it (`spaces.owner_user_id`), or you have a
 * `space_member` row; you OWN it via `owner_user_id` or a member row with role
 * `owner`. Read on the tenant-locked server handle, whose JWT subject is not
 * the user — so this is the enforcement on that lane, not a convenience over
 * RLS.
 */
export async function readSpaceAccess(
  client: SupabaseClient,
  params: { tenantId: string; userId: string }
): Promise<SpaceAccessMap> {
  const [spaces, members] = await Promise.all([
    client
      .schema("core")
      .from("spaces")
      .select("id, owner_user_id, visibility")
      .eq("tenant_id", params.tenantId)
      .is("deleted_at", null),
    client
      .schema("core")
      .from("space_member")
      .select("space_id, role")
      .eq("tenant_id", params.tenantId)
      .eq("user_id", params.userId),
  ]);
  if (spaces.error) {
    throw new Error(`space access: ${spaces.error.message}`);
  }
  if (members.error) {
    throw new Error(`space access: ${members.error.message}`);
  }
  const roles = new Map(
    ((members.data ?? []) as Array<{ role: string; space_id: string }>).map(
      (row) => [row.space_id, row.role]
    )
  );
  const access = new Map<string, SpaceAccessEntry>();
  for (const space of (spaces.data ?? []) as Array<{
    id: string;
    owner_user_id: string | null;
    visibility: string;
  }>) {
    const role = roles.get(space.id);
    const isOwner = space.owner_user_id === params.userId || role === "owner";
    if (isOwner || role !== undefined || space.visibility === "open") {
      access.set(space.id, { isOwner });
    }
  }
  return access;
}

/**
 * May this person connect an account into, or use the accounts of, `spaceId`?
 * Tenant admins (`core.users.manage`) may act in every Space of their tenant.
 */
export async function canEnterSpace(
  client: SupabaseClient,
  params: {
    capabilities?: readonly string[];
    spaceId: string;
    tenantId: string;
    userId: string;
  }
): Promise<boolean> {
  if (capabilityCovers([...(params.capabilities ?? [])], "core.users.manage")) {
    return true;
  }
  const access = await readSpaceAccess(client, {
    tenantId: params.tenantId,
    userId: params.userId,
  });
  return access.has(params.spaceId);
}

const RUN_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * May this call use the accounts of the Space it names (`x-engenty-space-id`)?
 *
 * The header decides which Space's accounts a call reaches, so it is a claim
 * to check, not a narrowing to trust:
 * - a PERSON must be able to enter the Space ({@link canEnterSpace});
 * - an agent or service principal (a headless run) may use an OPEN Space, or
 *   the Space its own routine (`x-engenty-trigger-id`) or task
 *   (`x-engenty-task-id`) belongs to — read from that row, tenant-scoped, so a
 *   forged id unlocks nothing beyond what that routine or task already
 *   legitimizes. Same rule core applies to a headless run's space surface.
 *
 * Fails closed: an unreadable row answers no.
 */
export async function mayUseSpaceInRun(
  client: SupabaseClient,
  params: {
    capabilities?: readonly string[];
    principalId: string;
    principalType: "user" | "agent" | "service";
    spaceId: string;
    taskId?: string | null;
    tenantId: string;
    triggerId?: string | null;
  }
): Promise<boolean> {
  if (params.principalType === "user") {
    return canEnterSpace(client, {
      spaceId: params.spaceId,
      tenantId: params.tenantId,
      userId: params.principalId,
      ...(params.capabilities ? { capabilities: params.capabilities } : {}),
    });
  }
  const space = await client
    .schema("core")
    .from("spaces")
    .select("visibility")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.spaceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (space.error || !space.data) {
    return false;
  }
  if ((space.data as { visibility: string }).visibility === "open") {
    return true;
  }
  const bound = async (schema: string, table: string, id: string) => {
    if (!RUN_ID_PATTERN.test(id)) {
      return false;
    }
    const row = await client
      .schema(schema)
      .from(table)
      .select("space_id")
      .eq("tenant_id", params.tenantId)
      .eq("id", id)
      .maybeSingle();
    return (
      !row.error &&
      (row.data as { space_id: string | null } | null)?.space_id ===
        params.spaceId
    );
  };
  const triggerId = params.triggerId?.trim();
  if (triggerId && (await bound("ai", "routines", triggerId))) {
    return true;
  }
  const taskId = params.taskId?.trim();
  return (
    Boolean(taskId) && (await bound("module_tasks", "tasks", taskId ?? ""))
  );
}
