/**
 * "Which accounts may this space use?" (PLAN-spaces.md Phase CN.3).
 *
 * The fourth authorization axis. The other three answer WHO (sharing +
 * ownership), WHAT (action policies) and WHEN (autonomous mode); this one
 * answers WHERE, and it is the only one that was missing — mounting Gmail into
 * a space used to grant every Gmail account in the tenant, because the mount
 * key was the connector.
 *
 * **Narrowing only, which is why the space id may come from a header.** The
 * caller intersects this set with candidates it has already resolved from the
 * principal's own sharing and capability rules. Naming a space you are not in
 * therefore removes accounts from your own list; it cannot add one.
 *
 * A read of `core.space_mount` from outside core, deliberately: the alternative
 * is a second copy of the mount list published through the plugin API, and a
 * second copy is how "what the space shows" and "what the agent may call" start
 * disagreeing. The handle is tenant-locked, so the tenant wall is still the
 * database's.
 *
 * In the SDK rather than the connections module because two modules need the
 * same answer — the connections policy (may this call use this account?) and
 * the inbox account list (which mailboxes belong on this page?) — and those
 * two must not drift into different definitions of "mounted".
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * What a space's engentys may do with an account mounted here — the per-space
 * half of the pair whose other half is the account's own `autonomous_mode`
 * (the owner's ceiling). Same three words `space_mount.agent_access` already
 * uses for modules.
 */
export type SpaceConnectionAccess = "none" | "read" | "write";

/**
 * Connection ids mounted in `spaceId`, or null when the space's mounts could
 * not be read.
 *
 * Null means "do not narrow" — the same reach the call had before Phase CN, and
 * every deny below this point still applies. Failing shut here would turn a
 * core hiccup into a dead connector for every space at once, and the mount is a
 * narrowing rather than the thing that authorizes the call.
 */
export async function listMountedConnectionIds(
  client: SupabaseClient,
  tenantId: string,
  spaceId: string
): Promise<Set<string> | null> {
  const access = await listMountedConnectionAccess(client, tenantId, spaceId);
  return access === null ? null : new Set(access.keys());
}

/**
 * How far this space's engentys may go with each account mounted here
 * (PLAN-connections-ux.md B1).
 *
 * `null` for a mounted account means the space never decided, and the gate then
 * falls back to the account's own `autonomous_mode` — the behaviour every space
 * had before the level existed. `"none"` is the opposite and is a decision:
 * the account is available here, and engentys get nothing from it.
 *
 * Same query as {@link listMountedConnectionIds}, which is derived from this
 * one: "which accounts" and "how far" must never be two reads that can disagree
 * about what is mounted.
 */
export async function listMountedConnectionAccess(
  client: SupabaseClient,
  tenantId: string,
  spaceId: string
): Promise<Map<string, SpaceConnectionAccess | null> | null> {
  const result = await client
    .schema("core")
    .from("space_mount")
    .select("resource_key, agent_access")
    .eq("tenant_id", tenantId)
    .eq("space_id", spaceId)
    .eq("resource_type", "connection");
  if (result.error) {
    return null;
  }
  const rows = (result.data ?? []) as Array<{
    agent_access: string | null;
    resource_key: string;
  }>;
  return new Map(
    rows.map((row) => [
      row.resource_key,
      toSpaceConnectionAccess(row.agent_access),
    ])
  );
}

function toSpaceConnectionAccess(
  value: string | null
): SpaceConnectionAccess | null {
  return value === "none" || value === "read" || value === "write"
    ? value
    : null;
}

/**
 * The account filter a module should apply to its RECORDS in this run
 * (PLAN-connections-ux.md E1/E2).
 *
 * One definition of the rule, because three modules keep mail, files and time
 * entries against accounts and each would otherwise invent its own reading of
 * "in this space":
 *
 * - **no space named** → `null`, do not narrow. A run outside a space is
 *   intentionally tenant-wide, and every pre-space caller must behave exactly
 *   as it did.
 * - **mounts unreadable** → `null` too. The mount narrows; failing shut here
 *   would empty every space's records at once over a core hiccup, and the
 *   calls that name an account are re-checked anyway.
 * - **space with no accounts** → an EMPTY set, which is a decision and not an
 *   absence: that space has no records of this kind, and answering with the
 *   tenant's is the leak this exists to close.
 *
 * A narrowing only. Consumers intersect it with the visibility they already
 * resolved (owner, sharing, agent grants), so naming a space can remove rows
 * and never add one.
 */
export async function resolveSpaceRecordAccounts(
  client: SupabaseClient,
  params: { spaceId?: string | null; tenantId: string }
): Promise<ReadonlySet<string> | null> {
  const spaceId = params.spaceId?.trim();
  if (!spaceId) {
    return null;
  }
  return await listMountedConnectionIds(client, params.tenantId, spaceId);
}

/**
 * Grant a freshly connected account to the space the connect started from
 * (CN.4 Flow A). Returns whether the mount now exists.
 *
 * Best-effort by contract, not by accident: the account IS connected by the
 * time this runs, so a failure here must not turn a successful OAuth round
 * trip into an error page. The user lands in the space, sees the account
 * missing, and can add it — annoying, and strictly better than being told the
 * connect failed when it did not.
 *
 * Idempotent — the same account connected twice from the same space is one
 * mount, which is what `onConflict` on the mount's natural key gives us.
 */
export async function mountConnectionInSpace(
  client: SupabaseClient,
  params: { connectionId: string; spaceId: string; tenantId: string }
): Promise<boolean> {
  // `agent_access` is deliberately absent from the payload: an upsert only
  // updates the columns it names, and re-connecting an account that is already
  // mounted must not silently reset the level this space chose for it
  // (PLAN-connections-ux.md B1). On insert it stays NULL — undecided.
  const result = await client.schema("core").from("space_mount").upsert(
    {
      is_required: false,
      resource_key: params.connectionId,
      resource_type: "connection",
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
 * The user whose personal reach a run in this space may act with — the
 * PERSONAL-SPACE owner resolution (PLAN-space-computer.md §2.1).
 *
 * A personal space is `core.spaces.owner_user_id IS NOT NULL` (private, no
 * members). Runs in it should work with the owner's own accounts, but a
 * headless run executes as the AI service principal, so `owner_user_id ===
 * principalId` never matches. This resolves the stand-in — under verification,
 * because the space id itself is a narrowing-only header a caller could name
 * freely, and owner reach ADDS:
 *
 * - Only for NON-USER principals. A user in their own personal space already
 *   IS the owner; any other user cannot enter it at all.
 * - Only when the run's routine (x-engenty-trigger-id) is stored, tenant-
 *   scoped, as bound to EXACTLY this space. A forged trigger id unlocks
 *   nothing beyond what that routine already legitimizes — the same argument
 *   the routine space claim makes in core.
 *
 * The stand-in covers the sharing clamp ONLY (`actsForSpaceOwner`): the
 * owner's `autonomous_mode` ceiling, the space mount level, action policies
 * and approval asks (addressed to the owner) all still apply.
 *
 * Returns null whenever any link is missing — which is every call today that
 * predates the feature, so nothing widens by default.
 */
export async function resolveVerifiedSpaceOwnerForRun(
  client: SupabaseClient,
  params: {
    principalType: "user" | "agent" | "service";
    spaceId: string | null | undefined;
    tenantId: string;
    triggerId: string | null | undefined;
  }
): Promise<string | null> {
  const spaceId = params.spaceId?.trim();
  const triggerId = params.triggerId?.trim();
  if (params.principalType === "user" || !spaceId || !triggerId) {
    return null;
  }
  const routine = await client
    .schema("ai")
    .from("routines")
    .select("space_id")
    .eq("id", triggerId)
    .eq("tenant_id", params.tenantId)
    .maybeSingle();
  const routineSpaceId = routine.error
    ? null
    : (routine.data as { space_id: string | null } | null)?.space_id;
  if (!routineSpaceId || routineSpaceId !== spaceId) {
    return null;
  }
  const space = await client
    .schema("core")
    .from("spaces")
    .select("owner_user_id")
    .eq("id", spaceId)
    .eq("tenant_id", params.tenantId)
    .maybeSingle();
  if (space.error) {
    return null;
  }
  return (
    (space.data as { owner_user_id: string | null } | null)?.owner_user_id ??
    null
  );
}
