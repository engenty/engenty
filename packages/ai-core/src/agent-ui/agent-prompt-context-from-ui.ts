import type { AgentUiStateSnapshotV1 } from "@engenty/ag-ui-bridge";
import { resolveAgentDefinitionById } from "../registry.js";

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const MODULE_PATH_RE = /^\/module\/([^/]+)/i;

// Module the user is currently working in: selection entity type first, then
// the `/module/<name>` route segment. Exported for the C6 skill-catalog hint.
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
    "When the user asks which page, module, or URL they are on, answer from pathname and page_module above. Do not claim you cannot see the current URL."
  );

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
