import { tool } from "ai";
import { z } from "zod";
import type { ToolExecutionContext } from "../context/types.js";

const httpMethodSchema = z.enum([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
]);

const transportSchema = z.enum(["rest", "cli", "mcp"]);
const catalogSearchStrategySchema = z.enum(["lexical", "semantic", "hybrid"]);

const authMetadataSchema = z.object({
  requiredCapabilities: z.array(z.string()),
  requiresApproval: z.boolean(),
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
});

const httpRequestSchema = z.object({
  body: z.string().optional(),
  params: z.array(z.string()),
  query: z.array(z.string()),
});

const httpResponseSchema = z.object({
  schema: z.string().optional(),
  successStatuses: z.array(z.number().int()),
});

export const engentyApiCatalogMatchSchema = z.object({
  auth: authMetadataSchema.optional(),
  description: z.string().optional(),
  id: z.string(),
  inputSchema: z.string().optional(),
  kind: z.enum(["http_route", "tool"]),
  method: httpMethodSchema.optional(),
  moduleId: z.string().optional(),
  outputSchema: z.string().optional(),
  path: z.string().optional(),
  pluginId: z.string().optional(),
  readOnly: z.boolean(),
  request: httpRequestSchema.optional(),
  response: httpResponseSchema.optional(),
  tags: z.array(z.string()).optional(),
  title: z.string(),
  toolId: z.string().optional(),
  transports: z.array(transportSchema).optional(),
});

export const engentyApiCatalogInputSchema = z.object({
  kind: z.enum(["all", "http_route", "tool"]).optional().meta({
    description:
      'Optional filter. Use "tool" first when looking for callable tools/actions. Use "all" only if no suitable tool is found, and "http_route" only when an OpenAPI/HTTP endpoint is explicitly needed.',
  }),
  limit: z
    .number()
    .int()
    .min(1)
    .max(25)
    .optional()
    .default(10)
    .meta({ description: "Maximum number of matches to return." }),
  method: httpMethodSchema.optional().meta({
    description:
      "Optional HTTP method filter for HTTP route discovery only. Do not set this when searching for kind tool.",
  }),
  moduleId: z.string().trim().min(1).optional().meta({
    description: "Optional module id filter, for example contacts or team.",
  }),
  pluginId: z.string().trim().min(1).optional().meta({
    description:
      "Advanced owner filter for the runtime plugin/package id. Prefer moduleId for normal module searches; only set pluginId when reusing a pluginId returned by a previous catalog match.",
  }),
  query: z.string().trim().min(1).optional().meta({
    description:
      "What you are looking for, for example 'current user', 'team members', 'dashboard', or 'contacts list'. Also include the action you want to perform, for example 'list users', 'search knowledge base articles', 'create a new team member', etc.",
  }),
  readOnlyOnly: z.boolean().optional().meta({
    description:
      "When true, only return read-only HTTP routes or low-risk idempotent tools. Useful for data lookup/listing requests.",
    default: false,
  }),
  strategy: catalogSearchStrategySchema.optional().meta({
    description:
      'Search strategy for query ranking. "hybrid" combines lexical and semantic vector scoring; "semantic" uses vector scoring only; "lexical" avoids embeddings.',
    default: "hybrid",
  }),
});

export const engentyApiCatalogResultSchema = z.object({
  matches: z.array(engentyApiCatalogMatchSchema),
  total: z.number().int().min(0),
});

export type EngentyApiCatalogInput = z.infer<
  typeof engentyApiCatalogInputSchema
>;
export type EngentyApiCatalogResult = z.infer<
  typeof engentyApiCatalogResultSchema
>;

export const ENGENTY_API_CATALOG_TOOL_ID = "core_api_catalog_search";

export function buildEngentyApiCatalogTool(ctx: ToolExecutionContext) {
  return tool({
    description:
      'Discover Engenty APIs before fetching data. Prefer searching with kind "tool" first to find callable tools/actions; broaden to kind "all" only when no suitable tool exists. Returns matching HTTP routes and tools with request hints, response schema summaries, and auth metadata.',
    inputSchema: engentyApiCatalogInputSchema,
    execute: async (input: EngentyApiCatalogInput): Promise<unknown> => {
      const call = ctx.callGatewayMethod;
      if (!call) {
        return { error: "Tool caller not available" };
      }
      try {
        return await call(ENGENTY_API_CATALOG_TOOL_ID, input);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { error: message };
      }
    },
  });
}
