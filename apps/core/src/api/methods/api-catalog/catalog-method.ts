import {
  ENGENTY_API_CATALOG_TOOL_ID,
  type EngentyApiCatalogInput,
  type EngentyApiCatalogResult,
  engentyApiCatalogInputSchema,
  engentyApiCatalogResultSchema,
} from "@engenty/ai-core";
import type {
  PluginAuthContext,
  PluginGatewayMethod,
} from "@engenty/plugin-sdk";

export function buildEngentyApiCatalogMethod(
  getApiCatalog: (
    input: EngentyApiCatalogInput,
    auth?: PluginAuthContext
  ) => EngentyApiCatalogResult | Promise<EngentyApiCatalogResult>
): PluginGatewayMethod {
  return {
    name: ENGENTY_API_CATALOG_TOOL_ID,
    summary: "Search the Engenty API catalog",
    description:
      "Returns matching HTTP routes and tools with schema summaries so agents can discover the right endpoint before fetching data.",
    inputSchema: engentyApiCatalogInputSchema,
    outputSchema: engentyApiCatalogResultSchema,
    operation: {
      moduleId: "core",
      operationId: ENGENTY_API_CATALOG_TOOL_ID,
      requiredCapabilities: [],
      riskLevel: "low",
      requiresApproval: false,
    },
    handler: async (input, ctx) =>
      getApiCatalog(input as EngentyApiCatalogInput, ctx.auth),
  };
}
