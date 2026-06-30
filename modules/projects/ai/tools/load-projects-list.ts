import type { ToolExecutionContext } from "@engenty/ai-core";
import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const PROJECTS_LOAD_PROJECTS_LIST_TOOL_ID = "load_projects_list";

const listInputSchema = z.object({
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(200).optional(),
  search: z.string().optional(),
  sortBy: z.enum(["title", "start_date", "end_date", "created_at"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

/** List projects via registered operations (paginated). */
export function buildLoadProjectsListTool(
  invokeProjectsOperation: PluginServerGatewayCaller["invokeOperation"],
  ctx?: ToolExecutionContext
) {
  return createTool({
    id: PROJECTS_LOAD_PROJECTS_LIST_TOOL_ID,
    description:
      "List projects for the tenant. Optional filters: page, pageSize (max 200), search, sortBy (title|start_date|end_date|created_at), sortOrder. Use when the user asks about multiple projects or the portfolio. If scope.list_search is set and search is omitted, the list search from the UI is applied.",
    inputSchema: listInputSchema,
    execute: async (input) => {
      const scope = ctx?.scope as Record<string, unknown> | null | undefined;
      const scopeSearch =
        typeof scope?.list_search === "string" ? scope.list_search : undefined;
      const merged = {
        ...input,
        search:
          input.search !== undefined && input.search !== ""
            ? input.search
            : scopeSearch,
      };
      return invokeProjectsOperation("projects_list", merged);
    },
  });
}
