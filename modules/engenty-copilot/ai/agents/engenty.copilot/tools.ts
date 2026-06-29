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

// AG-UI frontend tools are NOT listed here: they are registered per-run as native
// Mastra tools (the LLM calls them by name; they suspend the run and the browser
// executes/resumes). No invoke_frontend_tool meta-tool. See
// plans/006-ag-ui-native-frontend-tools.md.
export const ENGENTY_COPILOT_TOOL_IDS = [
  "chatThreadSearch",
  "requestDecision",
  "requestFeedback",
  "web_search",
  ...ENGENTY_CATALOG_TOOL_IDS,
  ...ENGENTY_VAULT_TOOL_IDS,
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
