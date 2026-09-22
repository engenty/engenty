/**
 * Mounting module routes a second time inside a space (PLAN-spaces.md Phase 5a,
 * Routing).
 *
 * The plan's constraint is what shapes this: "a space-mounted module needs no
 * route change … asking 11 modules to re-register routes is the version of this
 * that stalls." So the shell mirrors each `/mdl/<module>/…` path at
 * `/s/:spaceKey/<module>/…` and hands the space down through context. Modules
 * stay unaware.
 *
 * **Every module route is mirrored, not only the space-placed ones.** Placement
 * says where a module appears by DEFAULT on the rail; it does not say whether a
 * space may contain it (§1b-bis). Contacts is one address book per tenant and is
 * routinely mounted into a space; commercial settings shows its UI in a space
 * while its settings stay tenant-global. Mirroring only `placement === "space"`
 * would 404 exactly those.
 *
 * Placement decides the other direction — which legacy `/mdl/*` links should
 * REDIRECT into a space rather than stay where they are.
 */
import { spaceModuleUrlSegment } from "@engenty/ai-core/browser";

export const MODULE_ROUTE_PREFIX = "/mdl/";

export interface MirrorableRoute {
  id: string;
  path: string;
  pluginId: string;
}

export interface SpaceMirroredRoute<T extends MirrorableRoute> {
  /**
   * The same route under the module's CANONICAL id, for modules whose URL
   * segment is an alias (`knowledge-base` beside `kb`).
   *
   * Kept mounted rather than redirected: a space deep link minted before the
   * alias — a notification, a bookmark, an agent-produced ref — must still open
   * the page. Absent when the module has no alias, so the common case mounts
   * exactly one route.
   */
  legacyPath?: string;
  /** `<segment>/…` — RELATIVE to the `/s/:spaceKey` layout route. */
  path: string;
  route: T;
}

/**
 * The space mirror of a module route, or null when the path is not a module
 * route (settings, admin consoles and `/setup/*` have no in-space form).
 *
 * Returned RELATIVE, because the mirrors are children of the `/s/:spaceKey`
 * layout route — that layout is what renders the space's segmented tabs, and a
 * module opened inside a space must keep them.
 */
export function spaceMirrorPath(path: string): string | null {
  if (!path.startsWith(MODULE_ROUTE_PREFIX)) {
    return null;
  }
  const tail = path.slice(MODULE_ROUTE_PREFIX.length);
  const slash = tail.indexOf("/");
  const moduleId = slash === -1 ? tail : tail.slice(0, slash);
  if (!moduleId) {
    return null;
  }
  const segment = spaceModuleUrlSegment(moduleId);
  return segment === moduleId
    ? tail
    : segment + (slash === -1 ? "" : tail.slice(slash));
}

export function spaceMirroredRoutes<T extends MirrorableRoute>(
  routes: readonly T[]
): SpaceMirroredRoute<T>[] {
  const mirrors: SpaceMirroredRoute<T>[] = [];
  for (const route of routes) {
    const path = spaceMirrorPath(route.path);
    if (!path) {
      continue;
    }
    const canonical = route.path.slice(MODULE_ROUTE_PREFIX.length);
    mirrors.push({
      path,
      route,
      ...(canonical === path ? {} : { legacyPath: canonical }),
    });
  }
  return mirrors;
}

/**
 * Module ids whose legacy `/mdl/*` links should redirect into a space.
 *
 * Read from the plugins that declare `placement: "space"`, via any contribution
 * that carries the enriched value — the menu items.
 *
 * A module that contributes neither keeps `/mdl/` canonical — the conservative
 * direction: a link that still works is better than one redirected somewhere
 * invented.
 */
export function spacePlacedModuleIds(
  items: readonly { moduleId?: string; placement?: string; pluginId: string }[]
): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    if (item.placement === "space") {
      ids.add(item.moduleId ?? item.pluginId);
    }
  }
  return ids;
}

/**
 * The module id and the rest of a legacy module path.
 *
 * The module id is the FIRST segment after `/mdl/`, and the record id is the
 * second when it looks like one. `/mdl/offers/settings` and
 * `/mdl/expenses/import` have no record — asking the server where `settings` or
 * `import` lives would answer "nowhere" and send the user to the default space.
 */
export function parseLegacyModuleLink(pathname: string): {
  moduleId: string;
  recordId?: string;
  rest: string;
} | null {
  if (!pathname.startsWith(MODULE_ROUTE_PREFIX)) {
    return null;
  }
  const tail = pathname.slice(MODULE_ROUTE_PREFIX.length);
  const [moduleId, ...rest] = tail.split("/");
  if (!moduleId) {
    return null;
  }
  const first = rest[0];
  return {
    moduleId,
    rest: rest.join("/"),
    ...(first && !isLegacyModuleStaticSegment(first)
      ? { recordId: first }
      : {}),
  };
}

/** Sub-pages that are not records — `/mdl/<module>/settings` or `…/import`. */
function isLegacyModuleStaticSegment(segment: string): boolean {
  return segment === "settings" || segment === "import";
}
