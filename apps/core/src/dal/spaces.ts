/**
 * `core.spaces` — the steady container above Project (PLAN-spaces.md Phase 0).
 *
 * Reads and writes go through a tenant-locked handle where the caller has one;
 * `srv_tenant_isolation` then makes the tenant wall the database's problem rather
 * than this file's. The `tenant_id` filters below are belt to that braces — they
 * also keep the queries correct when a service-role client is passed (fixtures,
 * the superadmin console).
 */
import {
  type AgentApprovalMode,
  type ComputerNetworkTier,
  parseAgentApprovalMode,
  parseComputerNetworkTier,
} from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface Space {
  /**
   * Override of the tenant agent-approval mode for this space. Null inherits.
   * An explicit value replaces the tenant default in either direction.
   */
  agentApprovalMode: AgentApprovalMode | null;
  color: string | null;
  /**
   * Network reach of this space's shared computer. Null inherits the host
   * default. `none` still executes code — Engenty tools and Code Mode travel
   * over stdio — it only removes the open internet.
   */
  computerNetworkTier: ComputerNetworkTier | null;
  createdAt: string;
  /**
   * When set, the space is marked for deletion and hidden from every list.
   * The background sweep hard-deletes it after {@link Space.purgeAfter}.
   */
  deletedAt: string | null;
  /** One line about what this space is for. Shown on its home; never parsed. */
  description: string | null;
  icon: string | null;
  id: string;
  isDefault: boolean;
  key: string;
  name: string;
  /**
   * Set ⇒ this is somebody's personal space (PLAN-spaces.md Phase P). It is the
   * whole of what makes a space personal — there is no `kind` column and no
   * separate table, exactly as a Unix home directory is an ordinary directory
   * that happens to have an owner.
   */
  ownerUserId: string | null;
  /** Instant the background sweep may hard-delete this marked space. */
  purgeAfter: string | null;
  tenantId: string;
  /**
   * `private` ⇒ reachable only by its owner and members. Personal spaces are
   * always private (`spaces_personal_is_private_check`); sharing one is done by
   * granting membership, never by opening it to the tenant.
   */
  visibility: "open" | "private";
}

export interface CreateSpaceInput {
  color?: string | null;
  icon?: string | null;
  key: string;
  name: string;
  tenantId: string;
}

/**
 * What the setup dialog may change about the space itself.
 *
 * `key` is absent on purpose: it is the URL segment (`/s/<key>/…`), so renaming
 * it breaks every link anyone has saved. Renaming a space changes its label,
 * not its address.
 */
export interface UpdateSpaceInput {
  agentApprovalMode?: AgentApprovalMode | null;
  color?: string | null;
  computerNetworkTier?: ComputerNetworkTier | null;
  /** Empty string clears it; undefined leaves it alone. */
  description?: string | null;
  icon?: string | null;
  name?: string;
  /**
   * Making a space private hides it from everyone without a member row — it does
   * not delete anything, and flipping back to `open` restores it. A personal
   * space cannot be opened at all (`spaces_personal_is_private_check`), so the
   * database refuses that rather than this function.
   */
  visibility?: "open" | "private";
}

export interface GetSpaceOptions {
  /** Include a space that has been marked for deletion. Default hides those. */
  includeDeleted?: boolean;
}

const SPACE_COLUMN_LIST =
  "id, tenant_id, key, name, description, icon, color, is_default, visibility, owner_user_id, agent_approval_mode, computer_network_tier, created_at, deleted_at, purge_after";

/** URL segment shape, mirrored from `spaces_key_format_check` in the migration. */
const SPACE_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** How long a marked space stays recoverable before the sweep hard-deletes it. */
export const SPACE_PURGE_DEFAULT_DAYS = 7;

export function resolveSpacePurgeAfter(now = new Date()): Date {
  const parsed = Number.parseFloat(
    process.env.ENGENTY_SPACE_PURGE_AFTER_DAYS ?? ""
  );
  const days =
    Number.isFinite(parsed) && parsed >= 0 ? parsed : SPACE_PURGE_DEFAULT_DAYS;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

export interface SpaceRow {
  agent_approval_mode?: string | null;
  color: string | null;
  computer_network_tier?: string | null;
  created_at: string;
  deleted_at?: string | null;
  description?: string | null;
  icon: string | null;
  id: string;
  is_default: boolean;
  key: string;
  name: string;
  owner_user_id: string | null;
  purge_after?: string | null;
  tenant_id: string;
  visibility: string;
}

export function mapSpace(row: SpaceRow): Space {
  return {
    agentApprovalMode: parseAgentApprovalMode(row.agent_approval_mode),
    color: row.color,
    computerNetworkTier: parseComputerNetworkTier(row.computer_network_tier),
    createdAt: row.created_at,
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
    description: row.description ?? null,
    icon: row.icon,
    id: row.id,
    isDefault: row.is_default,
    key: row.key,
    name: row.name,
    ownerUserId: row.owner_user_id,
    purgeAfter: row.purge_after ? String(row.purge_after) : null,
    tenantId: row.tenant_id,
    visibility: row.visibility === "private" ? "private" : "open",
  };
}

export const SPACE_COLUMNS = SPACE_COLUMN_LIST;

function spacesTable(client: SupabaseClient) {
  return client.schema("core").from("spaces");
}

function withoutDeleted<T extends { is: (column: string, value: null) => T }>(
  query: T,
  includeDeleted: boolean | undefined
): T {
  return includeDeleted ? query : query.is("deleted_at", null);
}

/**
 * Every space in the tenant, INCLUDING every user's private personal space.
 *
 * The name is a warning label. On the tenant-locked handle the database enforces
 * the tenant wall and nothing else — the server lane's JWT subject is the nil
 * UUID, so `core.current_user_id()` is meaningless there and the browser-lane
 * membership policy cannot fire. A route that hands this list to a person shows
 * them their colleagues' private spaces.
 *
 * Legitimate callers are the ones acting for no particular user: the superadmin
 * console, backfills, fixtures. For anything user-facing use
 * {@link listAccessibleSpaces} (PLAN-spaces.md Phase P2).
 */
export async function listAllSpacesUnscoped(
  client: SupabaseClient,
  tenantId: string
): Promise<Space[]> {
  const result = await withoutDeleted(
    spacesTable(client).select(SPACE_COLUMNS).eq("tenant_id", tenantId),
    false
  )
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });
  if (result.error) {
    throw result.error;
  }
  return ((result.data ?? []) as SpaceRow[]).map(mapSpace);
}

/** Spaces in the tenant that are marked for deletion and still waiting to purge. */
export async function listMarkedDeletedSpaces(
  client: SupabaseClient,
  tenantId: string
): Promise<Space[]> {
  const result = await spacesTable(client)
    .select(SPACE_COLUMNS)
    .eq("tenant_id", tenantId)
    .not("deleted_at", "is", null)
    .order("name", { ascending: true });
  if (result.error) {
    throw result.error;
  }
  return ((result.data ?? []) as SpaceRow[]).map(mapSpace);
}

export async function getSpaceById(
  client: SupabaseClient,
  tenantId: string,
  spaceId: string,
  options?: GetSpaceOptions
): Promise<Space | null> {
  const result = await withoutDeleted(
    spacesTable(client)
      .select(SPACE_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("id", spaceId),
    options?.includeDeleted
  ).maybeSingle();
  if (result.error) {
    throw result.error;
  }
  return result.data ? mapSpace(result.data as SpaceRow) : null;
}

/** Batch lookup for the admin files explorer — overlay space UUID prefixes. */
export async function listSpacesByIds(
  client: SupabaseClient,
  tenantId: string,
  ids: readonly string[]
): Promise<Space[]> {
  if (ids.length === 0) {
    return [];
  }
  const result = await withoutDeleted(
    spacesTable(client)
      .select(SPACE_COLUMNS)
      .eq("tenant_id", tenantId)
      .in("id", ids),
    false
  );
  if (result.error) {
    throw result.error;
  }
  return ((result.data ?? []) as SpaceRow[]).map(mapSpace);
}

/** Lookup by URL segment (`/s/<key>/…`). Keys are unique per tenant, case-insensitively. */
export async function getSpaceByKey(
  client: SupabaseClient,
  tenantId: string,
  key: string,
  options?: GetSpaceOptions
): Promise<Space | null> {
  const result = await withoutDeleted(
    spacesTable(client)
      .select(SPACE_COLUMNS)
      .eq("tenant_id", tenantId)
      .ilike("key", key.trim()),
    options?.includeDeleted
  ).maybeSingle();
  if (result.error) {
    throw result.error;
  }
  return result.data ? mapSpace(result.data as SpaceRow) : null;
}

/**
 * The tenant's Company space. Guaranteed to exist by
 * `tenants_ensure_default_space`, so callers may treat absence as a broken
 * install rather than a case to handle.
 */
export async function getDefaultSpace(
  client: SupabaseClient,
  tenantId: string
): Promise<Space | null> {
  const result = await withoutDeleted(
    spacesTable(client)
      .select(SPACE_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("is_default", true),
    false
  ).maybeSingle();
  if (result.error) {
    throw result.error;
  }
  return result.data ? mapSpace(result.data as SpaceRow) : null;
}

/**
 * Create an additional space. Never creates a default one — that is the
 * database trigger's job, and a second default would violate
 * `spaces_tenant_default_uniq`.
 *
 * Creating a space is an ADMIN operation, because mounting resources onto it
 * issues capability grants (PLAN-spaces.md Phase 3). This function does not
 * check that; the route above it must.
 */
export async function createSpace(
  client: SupabaseClient,
  input: CreateSpaceInput
): Promise<Space> {
  const key = input.key.trim().toLowerCase();
  if (!SPACE_KEY_PATTERN.test(key)) {
    throw new Error("space_key_invalid");
  }
  const name = input.name.trim();
  if (!name) {
    throw new Error("space_name_required");
  }
  const result = await spacesTable(client)
    .insert({
      color: input.color ?? null,
      icon: input.icon ?? null,
      is_default: false,
      key,
      name,
      tenant_id: input.tenantId,
    })
    .select(SPACE_COLUMNS)
    .single();
  if (result.error) {
    throw result.error;
  }
  return mapSpace(result.data as SpaceRow);
}

/**
 * Rename or restyle a space. Same admin gate as creation: the setup dialog that
 * edits these fields is the one that edits mounts, so both halves of its save
 * go through an admin-only route.
 */
export async function updateSpace(
  client: SupabaseClient,
  tenantId: string,
  spaceId: string,
  input: UpdateSpaceInput
): Promise<Space> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) {
      throw new Error("space_name_required");
    }
    patch.name = name;
  }
  if (input.description !== undefined) {
    const description = input.description?.trim() ?? "";
    patch.description = description || null;
  }
  if (input.icon !== undefined) {
    patch.icon = input.icon;
  }
  if (input.color !== undefined) {
    patch.color = input.color;
  }
  if (input.visibility !== undefined) {
    patch.visibility = input.visibility;
  }
  if (input.agentApprovalMode !== undefined) {
    patch.agent_approval_mode = input.agentApprovalMode;
  }
  if (input.computerNetworkTier !== undefined) {
    patch.computer_network_tier = input.computerNetworkTier;
  }
  if (Object.keys(patch).length === 0) {
    const current = await getSpaceById(client, tenantId, spaceId);
    if (!current) {
      throw new Error("space_not_found");
    }
    return current;
  }
  const result = await withoutDeleted(
    spacesTable(client)
      .update(patch)
      .eq("tenant_id", tenantId)
      .eq("id", spaceId),
    false
  )
    .select(SPACE_COLUMNS)
    .single();
  if (result.error) {
    throw result.error;
  }
  return mapSpace(result.data as SpaceRow);
}

/**
 * Hide a space immediately and schedule the hard delete.
 *
 * The Company space and personal spaces are refused: the former is the tenant's
 * front door, the latter is somebody's home directory — neither is an admin
 * cleanup target.
 */
export async function markSpaceDeleted(
  client: SupabaseClient,
  tenantId: string,
  spaceId: string,
  purgeAfter: Date = resolveSpacePurgeAfter()
): Promise<Space> {
  const current = await getSpaceById(client, tenantId, spaceId, {
    includeDeleted: true,
  });
  if (!current) {
    throw new Error("space_not_found");
  }
  if (current.isDefault) {
    throw new Error("space_is_default");
  }
  if (current.ownerUserId) {
    throw new Error("space_is_personal");
  }
  if (current.deletedAt) {
    return current;
  }
  const now = new Date().toISOString();
  const result = await spacesTable(client)
    .update({
      deleted_at: now,
      purge_after: purgeAfter.toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("id", spaceId)
    .is("deleted_at", null)
    .select(SPACE_COLUMNS)
    .maybeSingle();
  if (result.error) {
    throw result.error;
  }
  if (!result.data) {
    throw new Error("space_not_found");
  }
  return mapSpace(result.data as SpaceRow);
}

/** Undo {@link markSpaceDeleted} while the grace period is still open. */
export async function restoreSpace(
  client: SupabaseClient,
  tenantId: string,
  spaceId: string
): Promise<Space> {
  const current = await getSpaceById(client, tenantId, spaceId, {
    includeDeleted: true,
  });
  if (!current) {
    throw new Error("space_not_found");
  }
  if (!current.deletedAt) {
    return current;
  }
  const result = await spacesTable(client)
    .update({ deleted_at: null, purge_after: null })
    .eq("tenant_id", tenantId)
    .eq("id", spaceId)
    .not("deleted_at", "is", null)
    .select(SPACE_COLUMNS)
    .maybeSingle();
  if (result.error) {
    throw result.error;
  }
  if (!result.data) {
    throw new Error("space_not_found");
  }
  return mapSpace(result.data as SpaceRow);
}

/**
 * Marked spaces whose grace period has elapsed. Used by the background sweep
 * on a service-role client so it can see every tenant.
 */
export async function listSpacesDueForPurge(
  client: SupabaseClient,
  now = new Date()
): Promise<Space[]> {
  const result = await spacesTable(client)
    .select(SPACE_COLUMNS)
    .not("deleted_at", "is", null)
    .lte("purge_after", now.toISOString())
    .order("purge_after", { ascending: true });
  if (result.error) {
    throw result.error;
  }
  return ((result.data ?? []) as SpaceRow[]).map(mapSpace);
}

/** Hard-delete a marked space and the records it owns (`core.purge_space`). */
export async function purgeSpace(
  client: SupabaseClient,
  tenantId: string,
  spaceId: string
): Promise<void> {
  const result = await client
    .schema("core")
    .rpc("purge_space", { p_space_id: spaceId, p_tenant_id: tenantId });
  if (result.error) {
    throw result.error;
  }
}
