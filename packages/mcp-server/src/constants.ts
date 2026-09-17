/** MCP protocol revision Engenty serves. */
export const ENGENTY_MCP_PROTOCOL_VERSION = "2026-07-28";

export const MCP_APPS_EXTENSION = "io.modelcontextprotocol/ui";
export const MCP_TASKS_EXTENSION = "io.modelcontextprotocol/tasks";

export const CATALOG_TOOL_IDS = {
  describe: "engenty_tool_describe",
  execute: "engenty_tool_execute",
  modules: "engenty_tools_modules",
  search: "engenty_tools_search",
} as const;

export const DEFAULT_MCP_AUDIENCE = "engenty-mcp";
export const GENERIC_ENGENTY_AUDIENCE = "engenty";

/**
 * OAuth scopes advertised on Protected Resource Metadata.
 * Supabase Auth’s OAuth server only accepts these (plus `phone` /
 * `offline_access` on newer GoTrue). Custom scopes like `engenty-mcp` are
 * rejected at `/oauth/authorize` — resource binding stays on the `aud` claim.
 */
export const DEFAULT_MCP_OAUTH_SCOPES = ["openid", "profile", "email"] as const;

export const MCP_CORS_HEADERS = [
  "authorization",
  "content-type",
  "mcp-protocol-version",
  "mcp-method",
  "mcp-name",
  "last-event-id",
] as const;

export const OPERATION_RESULT_WIDGET_URI = "ui://engenty/operation-result.html";
