/**
 * The one gate for `space_id` on module routes (PLAN-spaces.md Phase P4).
 *
 * The space Data tree (born "the Drive") is what exposed this. It builds a
 * space's tree by fanning out to
 * `/api/projects?space_id=…`, `/api/kb/knowledge-bases?space_id=…` and the file
 * space listing — MODULE routes, none of which pass through core's
 * `requireSpaceAccess`. Guarding the tree's endpoint would have fixed the tree
 * and left the doors open: the leak is not "the tree shows too much", it is
 * **every module route that accepts a space filter trusts the id it is given**.
 * Nothing stops a second user from putting a colleague's personal space id in
 * that query string by hand.
 *
 * So the check goes where all of them already converge — the single
 * `route.handler(...)` dispatch in plugin-http-routes.ts — rather than being
 * copied into each module, where the copy that is forgotten is the one that
 * matters. A module gains a space filter and is covered without knowing this
 * file exists.
 *
 * Not fixable in the database: module DAL runs partly on a service-role client
 * with RLS bypassed (see the cross-schema tenant-scope work), and the server
 * lane's JWT subject is the nil UUID, so even RLS-enforced paths cannot tell
 * which user is asking.
 *
 * **404, not 403** — matching core's `requireSpaceAccess`. Personal spaces are
 * named after people; confirming one exists is itself the leak.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { findAccessibleSpace } from "../../../dal/space-membership.js";

/**
 * A non-user principal has no membership rows. The nil UUID owns nothing and is
 * a member of nothing, so it resolves exactly the OPEN spaces — a headless
 * caller cannot use a service token to read a personal space.
 */
const NIL_USER_ID = "00000000-0000-0000-0000-000000000000";

/** Where a space id can arrive. Checked in this order; the first hit wins. */
const SPACE_KEYS = ["space_id", "spaceId"] as const;

function readSpaceId(source: unknown): string | null {
  if (!source || typeof source !== "object") {
    return null;
  }
  const record = source as Record<string, unknown>;
  for (const key of SPACE_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

/**
 * The identity fields of `PrincipalContext` (security/auth.ts).
 *
 * Note there is no `userId` here — for a user principal the user IS
 * `principalId`. Assuming otherwise is not a harmless mismatch: the subject
 * silently falls back to the nil UUID, every private space stops resolving, and
 * the symptom is that people cannot open THEIR OWN space. Found exactly that way,
 * by a live two-user run; the unit tests missed it because they built the auth
 * object in the shape the code wanted rather than the shape it receives.
 */
export interface PluginSpaceScopeAuth {
  /**
   * The user an agent is acting for. Takes precedence: an agent running a chat
   * turn on someone's behalf reaches exactly what that person reaches — no more
   * (it is not its own principal) and no less (it would otherwise be blind
   * inside the very space it was invoked from).
   */
  actingForUserId?: string | null;
  principalId?: string | null;
  principalType?: string | null;
  tenantId?: string | null;
}

export function pluginSpaceScopeSubject(
  auth: PluginSpaceScopeAuth | null
): string {
  return subjectFor(auth);
}

function subjectFor(auth: PluginSpaceScopeAuth | null): string {
  if (auth?.actingForUserId) {
    return auth.actingForUserId;
  }
  if (auth?.principalType === "user" && auth.principalId) {
    return auth.principalId;
  }
  return NIL_USER_ID;
}

/**
 * Returns the space id the request may not use, or null when it is allowed.
 *
 * Only `query` and `params` are inspected. A body-borne space id on a WRITE is a
 * different question — it decides where a record is created, not what is
 * disclosed — and answering it here would mean parsing every module's body
 * shape. Reads are what leak, and reads carry the id in the URL.
 */
export async function findForbiddenSpaceScope(input: {
  auth: PluginSpaceScopeAuth | null;
  getTenantDb?: ((auth: { tenantId: string }) => SupabaseClient) | null;
  params?: unknown;
  query?: unknown;
}): Promise<string | null> {
  const spaceId = readSpaceId(input.query) ?? readSpaceId(input.params);
  if (!spaceId) {
    return null;
  }
  const tenantId = input.auth?.tenantId;
  if (!(tenantId && input.getTenantDb)) {
    // No tenant or no database handle: this function cannot form an opinion, and
    // inventing a permissive one would make the gate silently absent wherever
    // the seam is wired up incompletely. The caller treats null as "allowed",
    // so anything reaching here is already outside the authenticated path.
    return null;
  }
  const space = await findAccessibleSpace(
    input.getTenantDb({ tenantId }),
    tenantId,
    subjectFor(input.auth),
    spaceId
  );
  return space ? null : spaceId;
}

/**
 * Reachability follows the mount, on the write side.
 *
 * The space sidebar and the mirrored routes already hide a module the space
 * never mounted; this refuses the request a person can still hand-craft — a
 * `POST /api/tasks` naming a space with no Tasks mount. Reads stay open: the
 * cross-space overview lists work from every space the caller may see, mount
 * or not, and the rows already carry their space.
 *
 * Only SPACE-PLACED modules (tasks, projects, the KB, …) are gated. A module
 * mounted "borrowed" — contacts, one address book per tenant — has no
 * per-space records to refuse. And only an EXPLICIT space id: a create that
 * names none resolves its space server-side (inherit → tenant default), and
 * the module owning that rule is the one that can check it.
 *
 * Returns the space id the write may not target, or null when it is allowed.
 */
export async function findUnmountedModuleSpace(input: {
  body?: unknown;
  method: string;
  moduleId: string;
  placement?: string | null;
  query?: unknown;
  /** The module ids mounted in a space, or null when the host cannot say. */
  resolveMountedModules: (
    spaceId: string
  ) => Promise<ReadonlySet<string> | null>;
}): Promise<string | null> {
  const method = input.method.toLowerCase();
  if (method === "get" || method === "head" || method === "options") {
    return null;
  }
  if (input.placement !== "space") {
    return null;
  }
  const spaceId = readSpaceId(input.body) ?? readSpaceId(input.query);
  if (!spaceId) {
    return null;
  }
  const mounted = await input.resolveMountedModules(spaceId);
  if (!mounted) {
    return null;
  }
  return mounted.has(input.moduleId) ? null : spaceId;
}
