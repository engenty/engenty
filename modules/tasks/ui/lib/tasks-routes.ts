// Single source of truth for all tasks module route paths.
// Convention: docs/content/dev/conventions/route-paths.md
//
// - tasksRoutePatterns  → consumed ONLY by plugin.ts route registration (`:id` forms)
// - tasksPaths          → consumed by navigate() / <Link> / breadcrumbs (concrete URLs; own encodeURIComponent)
// - matcher functions   → derive from BASE; keep identical names to tasks-sidebar-paths.ts so importers don't churn

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BASE = "/mdl/tasks";
const SPACE_ROUTE_PREFIX = "/s";

function buildTasksPaths(base: string) {
  return {
    root: base,
    briefing: `${base}/briefing`,
    // The inbox is the shell's notification center now — inside a space it
    // sits beside the module, not under it.
    inbox: base.startsWith(`${SPACE_ROUTE_PREFIX}/`)
      ? base.replace(/\/tasks$/, "/notifications")
      : "/notifications",
    list: `${base}/list`,
    settings: `${base}/settings`,
    operations: `${base}/operations`,
    taskDetail: (id: string) => `${base}/${encodeURIComponent(id)}`,
    taskEdit: (id: string) => `${base}/${encodeURIComponent(id)}/edit`,
  };
}

// ─── Route patterns — registration only (plugin.ts) ─────────────────────────

export const tasksRoutePatterns = {
  root: BASE,
  briefing: `${BASE}/briefing`,
  list: `${BASE}/list`,
  settings: `${BASE}/settings`,
  operations: `${BASE}/operations`,
  taskDetail: `${BASE}/:id`,
  taskEdit: `${BASE}/:id/edit`,
} as const;

// ─── Concrete path builders — navigation / Link / breadcrumbs ────────────────

export const tasksPaths = buildTasksPaths(BASE);

/** Concrete Tasks paths that stay inside the current Space. */
export function tasksPathsForSpace(spaceKey?: string | null) {
  const key = spaceKey?.trim();
  return key
    ? buildTasksPaths(`${SPACE_ROUTE_PREFIX}/${encodeURIComponent(key)}/tasks`)
    : tasksPaths;
}

// ─── Matchers — derived from BASE; no second copy of the path structure ───────

export function isBriefingPath(pathname: string): boolean {
  return (
    pathname === BASE ||
    pathname === `${BASE}/` ||
    pathname === tasksPaths.briefing
  );
}

/**
 * The space's own home (`/s/<key>`), where this briefing is stacked under the
 * composer. Hub cards stay on the Plan tab — Inbox and the lists already live
 * in the space sidebar from there.
 */
export function isSpaceRootPath(pathname: string): boolean {
  return /^\/s\/[^/]+\/?$/.test(pathname);
}

export function isTasksListPath(pathname: string): boolean {
  return pathname === tasksPaths.list;
}

export function isTaskDetailPath(pathname: string): string | null {
  const match = pathname.match(new RegExp(`^${BASE}/([^/]+)(?:/edit)?$`));
  const id = match?.[1];
  if (!(id && UUID_PATTERN.test(id))) {
    return null;
  }
  return id;
}

export function isOperationsPath(pathname: string): boolean {
  return pathname === tasksPaths.operations;
}

export function isSettingsPath(pathname: string): boolean {
  return (
    pathname === tasksPaths.settings ||
    pathname.startsWith(`${tasksPaths.settings}/`)
  );
}
