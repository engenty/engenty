import type { AgentUiStateSnapshotV1 } from "@engenty/ag-ui-bridge";
import {
  AGENT_UI_PAGE_BRIEF_KEYS,
  isAgentUiPageBriefKey,
} from "@engenty/ag-ui-bridge";
import { resolveAgentDefinitionById } from "../registry.js";

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Matches `/module/<name>` (legacy) and `/mdl/<name>` (live host routes). */
const MODULE_PATH_RE = /^\/(?:module|mdl)\/([^/]+)/i;

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
    const match = pathname.match(MODULE_PATH_RE);
    if (match?.[1]) {
      return match[1];
    }
  }
  return;
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

  return lines.join("\n");
}

function copyPageContext(
  page: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!page || typeof page !== "object" || Array.isArray(page)) {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(page)) {
    if (typeof value === "function") {
      continue;
    }
    out[key] = value;
  }
  return out;
}

/**
 * Maps bounded AG-UI state into the flat context record consumed by
 * {@link AgentDefinition.build_system_prompt}. This is the only supported path
 * for page preloads on apps/ai runs — not copilot scope snapshots.
 */
export function extractAgentPromptContextFromAgentUi(
  snapshot: AgentUiStateSnapshotV1
): Record<string, unknown> {
  const context: Record<string, unknown> = {
    ...copyPageContext(snapshot.page),
  };

  const pathname = readString(snapshot.route?.pathname);
  if (pathname) {
    context.pathname = pathname;
    context.current_pathname = pathname;
  }

  const pageModule = resolveCurrentPageModule(snapshot);
  if (pageModule) {
    context.current_page_module = pageModule;
    context.page_module = pageModule;
  }

  const moduleId = readString(snapshot.route?.module_id);
  if (moduleId) {
    context.route_module_id = moduleId;
    context.current_module = pageModule ?? moduleId;
    context.currentModule = pageModule ?? moduleId;
  }

  const routeKey = readString(snapshot.route?.route_key);
  if (routeKey) {
    context.route_key = routeKey;
    context.routeKey = routeKey;
  }

  const entityId = readString(snapshot.selection?.entity_id);
  if (entityId) {
    context.entityId = entityId;
    context.entity_id = entityId;
  }

  const entityType = readString(snapshot.selection?.entity_type);
  if (entityType) {
    context.entity_type = entityType;
  }

  return context;
}

/** Resolves module agent system prompt text from AG-UI state via registered builders. */
export async function buildAgentSystemPromptFromUiState(
  agentId: string,
  snapshot: AgentUiStateSnapshotV1
): Promise<string> {
  const agent = resolveAgentDefinitionById(agentId);
  if (!agent?.build_system_prompt) {
    return "";
  }
  const context = extractAgentPromptContextFromAgentUi(snapshot);
  const prompt = await agent.build_system_prompt({
    action: null,
    context,
    scope: {
      role: null,
      scope_id: "default",
      source: "user",
      tenant_id: null,
      user_id: null,
    },
  });
  return typeof prompt === "string" ? prompt.trim() : "";
}
