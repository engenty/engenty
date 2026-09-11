/**
 * In-app links for the records a module operation hands back.
 *
 * Every module page is mirrored at `/s/<space_key>/<module>/…` (apps/ui
 * `space-route-mirrors.ts`). An agent inside a space has no route table and no
 * host — only ids — so left to itself it invents a path or asks the person for
 * a "base domain". A `link` field it can copy verbatim removes the guess; the
 * chat renders these path-only URLs on the UI origin.
 *
 * Which space a record links into:
 *  - a record that carries its own `space_id` (tasks, projects, knowledge
 *    bases) links into THAT space — it is where the thing lives;
 *  - a tenant-shared record (contacts, offers, invoices, team) links into the
 *    space the CALL runs in (`auth.spaceId`) — the module is mounted there or
 *    the operation would have been refused;
 *  - with no space at all, or an unresolvable key, the `/mdl/…` form: the
 *    shell's LegacyModuleRedirect still lands it somewhere sensible.
 *
 * Module URL aliases (`engenty-copilot` → `copilot`) live in ai-core and are
 * not applied here: no module links to the copilot's pages from a tool result.
 */
import { resolveSpaceKey, type SpaceKeyClient } from "./space-key.js";

const MODULE_ROUTE_PREFIX = "/mdl/";

/** `/s/<key>/<moduleId>/<segments…>`, or `/mdl/<moduleId>/…` without a key. */
export function moduleRecordPath(
  spaceKey: string | null | undefined,
  moduleId: string,
  ...segments: readonly string[]
): string {
  const tail = [moduleId, ...segments]
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return spaceKey
    ? `/s/${encodeURIComponent(spaceKey)}/${tail}`
    : `${MODULE_ROUTE_PREFIX}${tail}`;
}

export interface RecordLinkAuth {
  spaceId?: string;
  tenantId: string;
}

/**
 * The link for one record. `recordSpaceId` is the record's own space when it
 * has one; it wins over the run's space. Absent both → `/mdl/…`.
 */
export type RecordLinker = (
  auth: RecordLinkAuth | undefined,
  moduleId: string,
  segments: readonly string[],
  recordSpaceId?: string | null
) => Promise<string>;

/**
 * Build a linker over the host's tenant-locked DB handle. Made once per
 * registration; `getTenantDb` absent (file-backed dev repos, tests) means every
 * link takes the `/mdl/…` form rather than failing.
 */
export function createRecordLinker(host: {
  getTenantDb?: (auth: { tenantId: string }) => unknown | null;
}): RecordLinker {
  return async (auth, moduleId, segments, recordSpaceId) => {
    const spaceId = recordSpaceId ?? auth?.spaceId ?? null;
    const client = spaceId && auth?.tenantId ? host.getTenantDb?.(auth) : null;
    const spaceKey = client
      ? await resolveSpaceKey(client as SpaceKeyClient, {
          spaceId: spaceId as string,
          tenantId: auth?.tenantId as string,
        })
      : null;
    return moduleRecordPath(spaceKey, moduleId, ...segments);
  };
}

/** `{...record, link}` — the shape every record-returning operation emits. */
export async function withRecordLink<T extends { id: string }>(
  record: T,
  link: (record: T) => Promise<string>
): Promise<T & { link: string }> {
  return { ...record, link: await link(record) };
}

/** Attach `link` to each row of a list result. */
export async function withRecordLinks<T extends { id: string }>(
  records: readonly T[],
  link: (record: T) => Promise<string>
): Promise<(T & { link: string })[]> {
  return Promise.all(records.map((record) => withRecordLink(record, link)));
}
