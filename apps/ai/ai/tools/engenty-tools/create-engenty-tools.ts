import { engentyToolExecuteTool } from "./engenty-tool-execute-tool.js";
import { engentyToolsContextTool } from "./engenty-tools-context-tool.js";
import { engentyToolsDiscoverTool } from "./engenty-tools-discover-tool.js";
import { engentyToolsModulesTool } from "./engenty-tools-modules-tool.js";
import { engentyToolsSearchTool } from "./engenty-tools-search-tool.js";

/** Catalog runner tools attached directly to agents (no HTTP delegate shim). */
export function createEngentyCatalogTools() {
  return {
    engenty_tools_context: engentyToolsContextTool,
    engenty_tools_discover: engentyToolsDiscoverTool,
    engenty_tools_modules: engentyToolsModulesTool,
    engenty_tool_execute: engentyToolExecuteTool,
    engenty_tools_search: engentyToolsSearchTool,
  };
}
