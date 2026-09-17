export {
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
export {
  type AuthInfo,
  acceptedContent,
  type CallToolResult,
  CLIENT_CAPABILITIES_META_KEY,
  fromJsonSchema,
  type InputRequiredResult,
  inputRequired,
  McpServer,
  PROTOCOL_VERSION_META_KEY,
  type ServerContext,
} from "@modelcontextprotocol/server";
export {
  clearMcpAppTemplatesForTests,
  DEFAULT_OPERATION_RESULT_HTML,
  ensureDefaultOperationResultTemplate,
  getMcpAppTemplate,
  hashTemplateHtml,
  listMcpAppTemplates,
  MCP_APP_RESOURCE_MIME,
  MCP_APP_TEMPLATE_MAX_BYTES,
  type McpAppCsp,
  type McpAppTemplate,
  registerMcpAppTemplate,
} from "./apps-registry.js";
export { catalogToolDefinitions } from "./catalog.js";
export {
  CATALOG_TOOL_IDS,
  DEFAULT_MCP_AUDIENCE,
  DEFAULT_MCP_OAUTH_SCOPES,
  ENGENTY_MCP_PROTOCOL_VERSION,
  GENERIC_ENGENTY_AUDIENCE,
  MCP_APPS_EXTENSION,
  MCP_CORS_HEADERS,
  MCP_TASKS_EXTENSION,
  OPERATION_RESULT_WIDGET_URI,
} from "./constants.js";
export {
  createEngentyMcpHttpHandler,
  createMcpBearerGate,
  type EngentyMcpHandlerOptions,
} from "./handler.js";
export { isMcpOriginAllowed, mcpOriginRejected } from "./origin.js";
export {
  buildMcpProtectedResourceMetadata,
  mcpResourceMetadataUrl,
  wwwAuthenticateChallenge,
} from "./resource-metadata.js";
