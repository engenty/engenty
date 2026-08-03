import type { MastraToolDefinition } from "@engenty/ai-core";

// Catalog runner tools attach directly to agents (no engenty-tools sub-agent).
export const ENGENTY_CATALOG_TOOL_IDS = [
  "engenty_tools_context",
  "engenty_tools_discover",
  "engenty_tools_modules",
  "engenty_tool_execute",
  "engenty_tools_search",
];

// Tenant vault storage tools (Speicher) — paths outside agent workspace mounts.
export const ENGENTY_VAULT_TOOL_IDS = [
  "vault_delete_file",
  "vault_download_file",
  "vault_get_file_url",
  "vault_list_files",
  "vault_upload_file",
];

// Artifact tools — AI-generated documents rendered in the artifact panel.
// Implementations live in apps/ai (createArtifactTools) and are resolved by the
// builtin registry; these ids gate what the copilot model may call.
export const ENGENTY_ARTIFACT_TOOL_IDS = [
  "artifact_create",
  "artifact_update",
  "artifact_get",
  "artifact_list",
  "artifact_store",
];

// Object rendering — module entities shown in chat by reference (implemented
// in apps/ai createShowObjectsTool, resolved by the builtin registry).
export const ENGENTY_OBJECT_TOOL_IDS = ["show_objects"];

// Durable learning memory (modules/memory) — save/recall/archive markdown
// memory records at user/project/org/entity scope. Implemented in apps/ai
// (createMemoryTools), resolved by the builtin registry; agents carrying
// these ids also get the "## Memory" instructions layer appended.
export const ENGENTY_MEMORY_TOOL_IDS = [
  "memory_save",
  "memory_record_search",
  "memory_record_archive",
];

// Skill self-authoring (approval-gated): draft a SKILL.md proposal from a
// workflow performed successfully more than once; a human enables it.
export const ENGENTY_SKILL_PROPOSE_TOOL_IDS = ["skill_propose"];

// Generative UI — agent-authored sandboxed HTML widgets (show_widget) and
// declarative A2UI surfaces from the engenty catalog (show_ui). Implemented
// in apps/ai, resolved by the builtin registry.
export const ENGENTY_WIDGET_TOOL_IDS = ["show_widget", "show_ui"];

// CSV import helpers — deterministic cleanup (+ optional AI headers).
// Implemented in apps/ai via @engenty/import/server buildCleanupCsvTool.
export const ENGENTY_CSV_TOOL_IDS = ["cleanup_csv"];

// AG-UI frontend tools are NOT listed here: they are registered per-run as native
// Mastra tools (the LLM calls them by name; they suspend the run and the browser
// executes/resumes). No invoke_frontend_tool meta-tool. See
// plans/006-ag-ui-native-frontend-tools.md.
export const ENGENTY_COPILOT_TOOL_IDS = [
  // App building. Originally delegation-only (agent-app_coder), but two live
  // runs showed the routing-tier supervisor dodging delegation and scaffolding
  // "apps" in its own workspace instead — files no user can ever run. The
  // model's path of least resistance must BE the correct path, so the copilot
  // now carries app_build itself: one call runs the durable workflow and
  // publishes the real preview. Delegation remains the route for iterative,
  // multi-step builds; AGENTS.md draws that line.
  "app_build",
  "chatThreadSearch",
  "requestDecision",
  "requestFeedback",
  "web_search",
  ...ENGENTY_CATALOG_TOOL_IDS,
  ...ENGENTY_VAULT_TOOL_IDS,
  ...ENGENTY_ARTIFACT_TOOL_IDS,
  ...ENGENTY_MEMORY_TOOL_IDS,
  ...ENGENTY_OBJECT_TOOL_IDS,
  ...ENGENTY_SKILL_PROPOSE_TOOL_IDS,
  ...ENGENTY_WIDGET_TOOL_IDS,
  ...ENGENTY_CSV_TOOL_IDS,
];

export interface EngentyCopilotRuntimeTools {
  chatThreadSearch: MastraToolDefinition;
  requestDecision: MastraToolDefinition;
  requestFeedback: MastraToolDefinition;
  webSearch: MastraToolDefinition;
}

export function createEngentyCopilotAgentTools(
  tools: EngentyCopilotRuntimeTools
): Record<string, MastraToolDefinition> {
  return {
    chatThreadSearch: tools.chatThreadSearch,
    requestDecision: tools.requestDecision,
    requestFeedback: tools.requestFeedback,
    web_search: tools.webSearch,
  };
}
