import type { AgentUiStateSnapshotV1 } from "@engenty/ag-ui-bridge";
import {
  AGENT_UI_PAGE_BRIEF_KEYS,
  isAgentUiPageBriefKey,
} from "@engenty/ag-ui-bridge";
import { buildAppNavigationPathsPromptSection } from "./app-navigation-paths-prompt.js";
import {
  isSpaceReservedSegment,
  spaceModuleIdFromUrlSegment,
} from "./space-module-url.js";

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Matches `/module/<name>` (legacy) and `/mdl/<name>` (live host routes). */
const MODULE_PATH_RE = /^\/(?:module|mdl)\/([^/]+)/i;

/**
 * The same module, reached inside a space: `/s/<spaceKey>/<name>/…`
 * (PLAN-spaces.md Phase 5a, Routing).
 *
 * A space mirrors every module route, so once the space is the entry point a
 * module page's pathname stops starting with `/mdl/` — and this file is what
 * tells the agent WHICH module the user is looking at. Without the second
 * shape the copilot inside a space resolved no module at all: no page prompt,
 * no skill-catalog hint, and "where am I?" answered by asking the user which
 * page they were on.
 *
 * `/s/<key>` alone yields no module on purpose — the space root is the Work
 * list, not a module, and reporting the space key as a module id would send
 * every module-scoped lookup after something that does not exist.
 */
const SPACE_MODULE_PATH_RE = /^\/s\/[^/]+\/([^/]+)/i;

/** Soft cap for the harness "Current page" section (~5 KiB). */
const PAGE_HARNESS_SECTION_MAX_CHARS = 5 * 1024;
const PAGE_VALUE_MAX_CHARS = 800;

// Module the user is currently working in: selection entity type first, then
// the `/mdl/<name>` (or legacy `/module/<name>`) route segment. Exported for
// the C6 skill-catalog hint.
export function resolveCurrentPageModule(
  snapshot: AgentUiStateSnapshotV1
): string | undefined {
  const fromSelection = readString(snapshot.selection?.entity_type);
  if (fromSelection) {
    return fromSelection;
  }
  const pathname = readString(snapshot.route?.pathname);
  if (pathname) {
    const legacy = pathname.match(MODULE_PATH_RE)?.[1];
    if (legacy) {
      return legacy;
    }
    const segment = pathname.match(SPACE_MODULE_PATH_RE)?.[1];
    if (segment) {
      // The space's OWN pages (`/s/company/settings`) are not module pages —
      // reporting one would send the skill catalog after a module nobody ships.
      if (isSpaceReservedSegment(segment)) {
        return;
      }
      // A space URL carries the SHORT segment (`/s/company/kb/…`); the
      // agent needs the module ID, because that is what the skill catalog and
      // the tool contracts are keyed by.
      return spaceModuleIdFromUrlSegment(segment);
    }
  }
  return;
}

/**
 * The space key the user is standing in, or undefined outside `/s/…`.
 *
 * Read from the route rather than from the run's scope because it is the same
 * source the shell itself uses (the URL is the truth — PLAN-spaces.md Phase
 * 5a), so what the agent is told and what the user sees cannot disagree.
 */
export function resolveCurrentPageSpaceKey(
  snapshot: AgentUiStateSnapshotV1
): string | undefined {
  const pathname = readString(snapshot.route?.pathname);
  if (!pathname) {
    return;
  }
  return readString(pathname.match(/^\/s\/([^/]+)/i)?.[1]);
}

function formatPageValueCompact(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length <= PAGE_VALUE_MAX_CHARS) {
      return trimmed;
    }
    return `${trimmed.slice(0, PAGE_VALUE_MAX_CHARS - 1)}…`;
  }
  const json = JSON.stringify(value);
  if (json.length <= PAGE_VALUE_MAX_CHARS) {
    return json;
  }
  return `${json.slice(0, PAGE_VALUE_MAX_CHARS - 1)}…`;
}

function appendPageHarnessLines(
  lines: string[],
  page: Record<string, unknown>
): void {
  const briefLines: string[] = [];
  for (const key of AGENT_UI_PAGE_BRIEF_KEYS) {
    if (!(key in page)) {
      continue;
    }
    const value = page[key];
    if (value == null) {
      continue;
    }
    if (typeof value === "string" && value.trim().length === 0) {
      continue;
    }
    if (
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value as object).length === 0
    ) {
      continue;
    }
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }
    briefLines.push(`- ${key}: ${formatPageValueCompact(value)}`);
  }

  const extraLines: string[] = [];
  for (const [key, value] of Object.entries(page)) {
    if (isAgentUiPageBriefKey(key)) {
      continue;
    }
    if (value == null || typeof value === "function") {
      continue;
    }
    if (typeof value === "string" && value.trim().length === 0) {
      continue;
    }
    if (
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0
    ) {
      continue;
    }
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }
    extraLines.push(`- ${key}: ${formatPageValueCompact(value)}`);
  }

  if (briefLines.length === 0 && extraLines.length === 0) {
    return;
  }

  const sectionLines = ["Current page:"];
  let used = "Current page:\n".length;
  for (const line of [...briefLines, ...extraLines]) {
    const next = used + line.length + 1;
    if (next > PAGE_HARNESS_SECTION_MAX_CHARS) {
      sectionLines.push("- … (page context truncated)");
      break;
    }
    sectionLines.push(line);
    used = next;
  }
  lines.push(...sectionLines);
}

/** Bounded AG-UI route/selection summary for harness instructions on every run. */
export function formatAgentUiStateHarnessInstructions(
  snapshot: AgentUiStateSnapshotV1
): string {
  const pathname = readString(snapshot.route?.pathname);
  const routeModuleId = readString(snapshot.route?.module_id);
  const routeKey = readString(snapshot.route?.route_key);
  const pageModule = resolveCurrentPageModule(snapshot);
  const spaceKey = resolveCurrentPageSpaceKey(snapshot);
  const entityId = readString(snapshot.selection?.entity_id);
  const entityType = readString(snapshot.selection?.entity_type);
  const lines = [
    "Current app UI state (AG-UI snapshot from the host — authoritative for route and selection; not the browser address bar):",
  ];
  if (pathname) {
    lines.push(`- pathname: ${pathname}`);
  }
  if (pageModule) {
    lines.push(`- page_module: ${pageModule}`);
  }
  if (spaceKey) {
    // The KEY, not the id — this is the name the user sees in the URL and says
    // out loud. The run's own space (id, name, personal-or-not) comes from the
    // runtime context block, which resolves it against the caller's memberships.
    lines.push(`- space_key: ${spaceKey}`);
  }
  if (routeModuleId) {
    lines.push(`- route_module_id: ${routeModuleId}`);
  }
  if (routeKey) {
    lines.push(`- route_key: ${routeKey}`);
  }
  if (entityId) {
    lines.push(`- entity_id: ${entityId}`);
  }
  if (entityType) {
    lines.push(`- entity_type: ${entityType}`);
  }
  if (snapshot.shell) {
    lines.push(`- copilot_open: ${snapshot.shell.copilot_open}`);
    if (readString(snapshot.shell.dock_mode)) {
      lines.push(`- copilot_dock_mode: ${snapshot.shell.dock_mode}`);
    }
  }
  lines.push(
    `- observed_at: ${snapshot.observed_at}`,
    `- sequence: ${snapshot.sequence}`,
    "When the user asks which page, module, or URL they are on, answer from pathname, page_module, and Current page above. Do not claim you cannot see the current URL."
  );

  if (snapshot.page && typeof snapshot.page === "object") {
    appendPageHarnessLines(lines, snapshot.page as Record<string, unknown>);
  }

  // Described, app-contributed context (Ch.7): "what the user is looking at".
  const appContext = snapshot.app_context ?? [];
  if (appContext.length > 0) {
    lines.push("What the user is looking at (app-provided context):");
    for (const entry of appContext) {
      const value =
        typeof entry.value === "string"
          ? entry.value
          : JSON.stringify(entry.value);
      lines.push(`- ${entry.description}: ${value}`);
    }
  }

  // Shared state (Ch.6): keyed values the app and agent both read/write. The
  // agent updates these with the `set_state` tool; the UI reads them reactively.
  const shared = snapshot.shared;
  if (shared && Object.keys(shared).length > 0) {
    lines.push(
      "Shared state (read/write — use the `set_state` tool to update a key):"
    );
    for (const [key, value] of Object.entries(shared)) {
      lines.push(`- ${key}: ${JSON.stringify(value)}`);
    }
  }

  return [lines.join("\n"), buildAppNavigationPathsPromptSection()]
    .filter(Boolean)
    .join("\n\n");
}
