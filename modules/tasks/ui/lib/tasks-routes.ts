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
    // The shell's notification list, mounted inside Plan so its sidebar stays.
    inbox: `${base}/notifications`,
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
  inbox: `${BASE}/notifications`,
  list: `${BASE}/list`,
  settings: `${BASE}/settings`,
  operations: `${BASE}/operations`,
  taskDetail: `${BASE}/:id`,
  taskEdit: `${BASE}/:id/edit`,
} as const;

// ─── Global Plan — tenant-wide, outside any space ───────────────────────────

const GLOBAL_BASE = "/tasks";

/** Route patterns of the global Plan (registration only). */
export const tasksGlobalRoutePatterns = {
  root: GLOBAL_BASE,
  briefing: `${GLOBAL_BASE}/briefing`,
  inbox: `${GLOBAL_BASE}/notifications`,
  list: `${GLOBAL_BASE}/list`,
} as const;

/** Whether `pathname` is the global Plan (`/tasks/…`), not a space's. */
export function isGlobalTasksPath(pathname: string): boolean {
  return pathname === GLOBAL_BASE || pathname.startsWith(`${GLOBAL_BASE}/`);
}

// ─── Concrete path builders — navigation / Link / breadcrumbs ────────────────

export const tasksPaths = buildTasksPaths(BASE);

/**
 * The global Plan's paths: its own briefing, notifications and list. A task
 * keeps its `/mdl/tasks/<id>` link — the legacy redirect opens it in its own
 * space — and settings/operations are the tenant's.
 */
export const tasksGlobalPaths = {
  ...buildTasksPaths(BASE),
  root: GLOBAL_BASE,
  briefing: tasksGlobalRoutePatterns.briefing,
  inbox: tasksGlobalRoutePatterns.inbox,
  list: tasksGlobalRoutePatterns.list,
};

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
