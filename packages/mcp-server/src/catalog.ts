import { CATALOG_TOOL_IDS } from "./constants.js";

export const catalogToolDefinitions = [
  {
    name: CATALOG_TOOL_IDS.modules,
    description:
      "List Engenty modules the caller may reach over MCP, with operation counts.",
  },
  {
    name: CATALOG_TOOL_IDS.search,
    description:
      "Search reachable Engenty operations by name, module, or description.",
  },
  {
    name: CATALOG_TOOL_IDS.describe,
    description:
      "Return the JSON Schema 2020-12 contract for one reachable operation.",
  },
  {
    name: CATALOG_TOOL_IDS.execute,
    description:
      "Execute a catalog-eligible Engenty operation through the governed invoke path.",
  },
] as const;
