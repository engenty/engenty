/**
 * Who may enter a space (PLAN-spaces.md Phase P2).
 *
 * THIS FILE IS THE ENFORCEMENT, not a convenience over it. The migration's RLS
 * policies bind the BROWSER lane, where PostgREST puts the real user in
 * `request.jwt.claims`. Every path through here runs on the tenant-locked server
 * handle, whose JWT subject is the nil UUID — Postgres can tell which TENANT is
 * asking and cannot tell which USER. So a membership rule believed to be
 * "enforced by RLS" on a server path is enforced by nothing, and the predicates
 * below are the only thing standing between one person's personal space and
 * everybody else.
 *
 * The access rule, stated once: **you may enter a space iff it is open, or you
 * own it, or you have a member row.** It is spelled out twice on purpose — here
 * in SQL-over-PostgREST for the server lane, and in the RLS policy for the
 * browser lane — and `spaces.integration.test.ts` (the RLS policy, on a real
 * database) plus the tests beside this file keep the two saying the same thing.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mapSpace,
  SPACE_COLUMNS,
  type Space,
  type SpaceRow,
} from "./spaces.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SpaceMemberRole = "member" | "owner";

export interface SpaceMember {
  createdAt: string;
  /** Null when the row outlives its user — render the id rather than nothing. */
  displayName: string | null;
  email: string | null;
  role: SpaceMemberRole;
  spaceId: string;
  userId: string;
}

interface SpaceMemberRow {
  created_at: string;
  role: string;
  space_id: string;
  user_id: string;
  /**
   * PostgREST embeds a to-one relation as an object, but types it as either —
   * hence the array case. Not defensive coding: the shape genuinely differs
   * between a hint that resolves to one row and one that does not.
   */
  users?:
    | { display_name: string | null; email: string | null }
    | null
    | Array<{
        display_name: string | null;
        email: string | null;
      }>;
}

function embeddedUser(
  row: SpaceMemberRow
): { display_name: string | null; email: string | null } | null {
  const embedded = row.users;
  if (!embedded) {
    return null;
  }
  return Array.isArray(embedded) ? (embedded[0] ?? null) : embedded;
}

/**
 * Members with just enough of the person to render a row.
 *
 * Deliberately three fields and not `users(*)`: a member list needs a name, and
 * `core.users` also holds `private_phone`, `private_address` and
 * `emergency_contact`. Widening this to convenience-fetch the whole row is how a
 * roster becomes a data leak.
 *
 * The FK hint is explicit because `space_member` references `core.users` on the
 * composite `(user_id, tenant_id)` — PostgREST cannot guess which constraint to
 * embed through when a table has more than one path to the same target.
 */
const MEMBER_COLUMNS =
  "space_id, user_id, role, created_at, users!space_member_user_tenant_fkey(display_name, email)";

function memberTable(client: SupabaseClient) {
  return client.schema("core").from("space_member");
}

function spacesTable(client: SupabaseClient) {
  return client.schema("core").from("spaces");
}

function mapMember(row: SpaceMemberRow): SpaceMember {
  const user = embeddedUser(row);
  return {
    createdAt: row.created_at,
    displayName: user?.display_name ?? null,
    email: user?.email ?? null,
    role: row.role === "owner" ? "owner" : "member",
    spaceId: row.space_id,
    userId: row.user_id,
  };
}

/** Space ids this user has an explicit member row for. */
export async function memberSpaceIds(
  client: SupabaseClient,
  tenantId: string,
  userId: string
): Promise<Set<string>> {
  const result = await memberTable(client)
    .select("space_id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId);
  if (result.error) {
    throw result.error;
  }
  return new Set(
    ((result.data ?? []) as Array<{ space_id: string }>).map(
      (row) => row.space_id
    )
  );
}

/**
 * Every space this user may enter, default first, then alphabetical.
 *
 * Two queries rather than one `or(...)` filter: PostgREST's `or` takes a string
 * expression, and the member half needs a subquery it cannot express. Merging in
 * TypeScript keeps the rule readable and, more to the point, keeps it identical
 * to the RLS policy it mirrors.
 */
export async function listAccessibleSpaces(
  client: SupabaseClient,
  tenantId: string,
  userId: string
): Promise<Space[]> {
  const memberIds = await memberSpaceIds(client, tenantId, userId);
  const result = await spacesTable(client)
    .select(SPACE_COLUMNS)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });
  if (result.error) {
    throw result.error;
  }
  return ((result.data ?? []) as SpaceRow[])
    .filter(
      (row) =>
        row.visibility !== "private" ||
        row.owner_user_id === userId ||
        memberIds.has(row.id)
    )
    .map(mapSpace);
}

/**
 * The same rule as a set of ids, for cross-space aggregations.
 *
 * Anything that lists records ACROSS spaces — search, badge rollups, the space Data tree —
 * has to intersect with this. Those surfaces never pass through a `/s/<key>`
 * route, so no route guard protects them; this is what they filter on instead.
 */
export async function accessibleSpaceIds(
  client: SupabaseClient,
  tenantId: string,
  userId: string
): Promise<Set<string>> {
  return new Set(
    (await listAccessibleSpaces(client, tenantId, userId)).map(
      (space) => space.id
    )
  );
}

/**
 * Resolve a space by id or key **for this user**, or null if they may not enter
 * it — with no way to tell "not yours" apart from "does not exist".
 *
 * That conflation is the point: a 403 on someone else's personal space confirms
 * the space is real, which for a space named after a person leaks that the
 * person exists and that they have something there. Callers turn null into 404.
 */
export async function findAccessibleSpace(
  client: SupabaseClient,
  tenantId: string,
  userId: string,
  idOrKey: string
): Promise<Space | null> {
  const needle = idOrKey.trim();
  if (!needle) {
    return null;
  }
  const query = spacesTable(client)
    .select(SPACE_COLUMNS)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null);
  const result = await (UUID_PATTERN.test(needle)
    ? query.eq("id", needle)
    : query.ilike("key", needle)
  ).maybeSingle();
  if (result.error) {
    throw result.error;
  }
  if (!result.data) {
    return null;
  }
  const space = mapSpace(result.data as SpaceRow);
  return (await canAccessSpace(client, tenantId, userId, space)) ? space : null;
}

/** The access rule against an already-loaded space row. */
export async function canAccessSpace(
  client: SupabaseClient,
  tenantId: string,
  userId: string,
  space: Space
): Promise<boolean> {
  if (space.visibility !== "private") {
    return true;
  }
  if (space.ownerUserId === userId) {
    return true;
  }
  const result = await memberTable(client)
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("space_id", space.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (result.error) {
    throw result.error;
  }
  return result.data != null;
}

/**
 * Whether this person owns the space: the personal space's owner, or an
 * `owner` member row on a shared one. Owners decide what the space's
 * connections may do (PLAN-space-owned-connections.md).
 */
export async function isSpaceOwner(
  client: SupabaseClient,
  tenantId: string,
  spaceId: string,
  userId: string
): Promise<boolean> {
  const space = await spacesTable(client)
    .select("owner_user_id")
    .eq("tenant_id", tenantId)
    .eq("id", spaceId)
    .maybeSingle();
  if (space.error) {
    throw space.error;
  }
  if (!space.data) {
    return false;
  }
  // A personal space has exactly one owner and no member rows.
  const personalOwner = (space.data as { owner_user_id: string | null })
    .owner_user_id;
  if (personalOwner) {
    return personalOwner === userId;
  }
  const member = await memberTable(client)
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("space_id", spaceId)
    .eq("user_id", userId)
    .eq("role", "owner")
    .maybeSingle();
  if (member.error) {
    throw member.error;
  }
  return member.data != null;
}

/**
 * The shared spaces a given person belongs to, **as seen by another person**.
 *
 * Two subjects, and conflating them is the bug this signature exists to prevent:
 * `subjectUserId` is whose memberships are being listed, `viewerUserId` is who
 * is asking. The result is the intersection — a space the subject is in but the
 * viewer cannot enter must not appear, or a colleague's profile page becomes a
 * directory of private rooms the reader has no access to.
 *
 * Personal spaces never appear, and not by filtering: they hold no member rows
 * at all (`core.forbid_personal_space_member`), so there is nothing here to
 * exclude. That is the property that makes this endpoint safe to put on a
 * profile page — it can only ever list shared rooms.
 */
export async function listSpacesForUser(
  client: SupabaseClient,
  tenantId: string,
  subjectUserId: string,
  viewerUserId: string
): Promise<Space[]> {
  const subjectSpaceIds = await memberSpaceIds(client, tenantId, subjectUserId);
  if (subjectSpaceIds.size === 0) {
    return [];
  }
  const visible = await listAccessibleSpaces(client, tenantId, viewerUserId);
  return visible.filter((space) => subjectSpaceIds.has(space.id));
}

/** Everyone in a space. Server-lane only — the browser may read its own rows. */
export async function listSpaceMembers(
  client: SupabaseClient,
  tenantId: string,
  spaceId: string
): Promise<SpaceMember[]> {
  const result = await memberTable(client)
    .select(MEMBER_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("space_id", spaceId)
    .order("created_at", { ascending: true });
  if (result.error) {
    throw result.error;
  }
  // Owner first, then everyone else by name.
  //
  // Sorted here rather than in the query because `order("role")` is ALPHABETICAL
  // — "member" sorts before "owner", which put the owner at the bottom of their
  // own space's roster. PostgREST cannot express a CASE ordering, and the list
  // is small enough that the honest fix is to say what we mean in TypeScript.
  return ((result.data ?? []) as SpaceMemberRow[])
    .map(mapMember)
    .sort((left, right) => {
      if (left.role !== right.role) {
        return left.role === "owner" ? -1 : 1;
      }
      return (left.displayName ?? left.email ?? left.userId).localeCompare(
        right.displayName ?? right.email ?? right.userId
      );
    });
}

export async function addSpaceMember(
  client: SupabaseClient,
  tenantId: string,
  spaceId: string,
  userId: string,
  role: SpaceMemberRole = "member"
): Promise<SpaceMember> {
  const result = await memberTable(client)
    .upsert(
      { role, space_id: spaceId, tenant_id: tenantId, user_id: userId },
      { onConflict: "tenant_id,space_id,user_id" }
    )
    .select(MEMBER_COLUMNS)
    .single();
  if (result.error) {
    throw result.error;
  }
  return mapMember(result.data as SpaceMemberRow);
}

/**
 * Remove a member from a SHARED space.
 *
 * Personal spaces never reach here: they have no member rows at all
 * (`core.forbid_personal_space_member`), because a personal space's access is
 * `owner_user_id` and nothing else.
 */
export async function removeSpaceMember(
  client: SupabaseClient,
  tenantId: string,
  spaceId: string,
  userId: string
): Promise<void> {
  const result = await memberTable(client)
    .delete()
    .eq("tenant_id", tenantId)
    .eq("space_id", spaceId)
    .eq("user_id", userId);
  if (result.error) {
    throw result.error;
  }
}

/**
 * Take ownership of a personal space whose owner has left the tenant.
 *
 * The deliberate `root` escape hatch: an orphaned personal space is unreachable
 * by anyone (private, no members, no owner), which is correct — a colleague's
 * departure must not quietly publish their notes. Someone eventually needs what
 * is in there, so an admin may claim it, LOUDLY. The caller is responsible for
 * the audit event; this refuses to touch a space that still has an owner, so
 * "claim" can never become a way to take a live one.
 */
export async function claimOrphanedSpace(
  client: SupabaseClient,
  tenantId: string,
  spaceId: string,
  newOwnerUserId: string
): Promise<Space> {
  const result = await spacesTable(client)
    .update({ owner_user_id: newOwnerUserId })
    .eq("tenant_id", tenantId)
    .eq("id", spaceId)
    .is("owner_user_id", null)
    .is("deleted_at", null)
    .select(SPACE_COLUMNS)
    .maybeSingle();
  if (result.error) {
    throw result.error;
  }
  if (!result.data) {
    throw new Error("space_not_orphaned");
  }
  await addSpaceMember(client, tenantId, spaceId, newOwnerUserId, "owner");
  return mapSpace(result.data as SpaceRow);
}
