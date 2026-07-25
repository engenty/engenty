// Single source of truth for all tasks module route paths.
// Convention: docs/content/dev/conventions/route-paths.md
//
// - tasksRoutePatterns  → consumed ONLY by plugin.ts route registration (`:id` forms)
// - tasksPaths          → consumed by navigate() / <Link> / breadcrumbs (concrete URLs; own encodeURIComponent)
// - matcher functions   → derive from BASE; keep identical names to tasks-sidebar-paths.ts so importers don't churn

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BASE = "/mdl/tasks";

// ─── Route patterns — registration only (plugin.ts) ─────────────────────────

export const tasksRoutePatterns = {
  root: BASE,
  briefing: `${BASE}/briefing`,
  inbox: `${BASE}/inbox`,
  list: `${BASE}/list`,
  goals: `${BASE}/goals`,
  goalDetail: `${BASE}/goals/:id`,
  goalEdit: `${BASE}/goals/:id/edit`,
  settings: `${BASE}/settings`,
  routines: `${BASE}/routines`,
  operations: `${BASE}/operations`,
  routineDetail: `${BASE}/routines/:id`,
  routineEdit: `${BASE}/routines/:id/edit`,
  taskDetail: `${BASE}/:id`,
  taskEdit: `${BASE}/:id/edit`,
} as const;

// ─── Concrete path builders — navigation / Link / breadcrumbs ────────────────

export const tasksPaths = {
  root: BASE,
  briefing: `${BASE}/briefing`,
  inbox: `${BASE}/inbox`,
  list: `${BASE}/list`,
  goals: `${BASE}/goals`,
  goalDetail: (id: string) => `${BASE}/goals/${encodeURIComponent(id)}`,
  goalEdit: (id: string) => `${BASE}/goals/${encodeURIComponent(id)}/edit`,
  settings: `${BASE}/settings`,
  routines: `${BASE}/routines`,
  operations: `${BASE}/operations`,
  routineDetail: (id: string) => `${BASE}/routines/${encodeURIComponent(id)}`,
  routineEdit: (id: string) =>
    `${BASE}/routines/${encodeURIComponent(id)}/edit`,
  taskDetail: (id: string) => `${BASE}/${encodeURIComponent(id)}`,
  taskEdit: (id: string) => `${BASE}/${encodeURIComponent(id)}/edit`,
};

// ─── Matchers — derived from BASE; no second copy of the path structure ───────

export function isBriefingPath(pathname: string): boolean {
  return (
    pathname === BASE ||
    pathname === `${BASE}/` ||
    pathname === tasksPaths.briefing
  );
}

export function isRoutinesPath(pathname: string): boolean {
  return (
    pathname === tasksPaths.routines ||
    pathname.startsWith(`${tasksPaths.routines}/`)
  );
}

/** Active routine id from detail/edit URL, or null on the list route. */
export function isRoutineDetailPath(pathname: string): string | null {
  const match = pathname.match(
    new RegExp(`^${BASE}/routines/([^/]+)(?:/edit)?$`)
  );
  const raw = match?.[1];
  if (!raw) {
    return null;
  }
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function isGoalsListPath(pathname: string): boolean {
  return pathname === tasksPaths.goals;
}

export function isGoalDetailPath(pathname: string): string | null {
  const match = pathname.match(new RegExp(`^${BASE}/goals/([^/]+)(?:/edit)?$`));
  const id = match?.[1];
  return id && UUID_PATTERN.test(id) ? id : null;
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
