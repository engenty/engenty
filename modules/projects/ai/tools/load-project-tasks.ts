import type { ToolExecutionContext } from "@engenty/ai-core";
import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const PROJECTS_LOAD_PROJECT_TASKS_TOOL_ID = "load_project_tasks";

/** List project tasks or get a status count breakdown via registered operations. */
export function buildLoadProjectTasksTool(
  invokeProjectsOperation: PluginServerGatewayCaller["invokeOperation"],
  ctx?: ToolExecutionContext
) {
  return createTool({
    id: PROJECTS_LOAD_PROJECT_TASKS_TOOL_ID,
    description:
      "List tasks across projects (paginated) or get a status-count breakdown. Filters: project_id (defaults to scope.entityId), phase_id, assigned_to, status, scope (mine|all), search. Set count_only=true for status counts only.",
    inputSchema: z.object({
      project_id: z.string().optional().meta({
        description: "Filter to a single project; defaults to scope.entityId",
      }),
      phase_id: z.string().optional(),
      assigned_to: z.string().optional(),
      status: z.string().optional(),
      scope: z.enum(["mine", "all"]).optional(),
      search: z.string().optional(),
      page: z.number().int().positive().optional(),
      pageSize: z.number().int().positive().max(200).optional(),
      sortBy: z
        .enum(["updated_at", "created_at", "title", "status"])
        .optional(),
      sortOrder: z.enum(["asc", "desc"]).optional(),
      count_only: z.boolean().optional().meta({
        description:
          "If true, returns task counts by status instead of the full list",
      }),
    }),
    execute: async (input) => {
      const scopeRaw = ctx?.scope as Record<string, unknown> | null | undefined;
      const scopeEntityId = scopeRaw?.entityId;
      const resolvedProjectId =
        input.project_id ??
        (typeof scopeEntityId === "string" && scopeEntityId.length > 0
          ? scopeEntityId
          : undefined);

      if (input.count_only) {
        return invokeProjectsOperation("projects_task_counts", {
          project_id: resolvedProjectId,
          phase_id: input.phase_id,
          assigned_to: input.assigned_to,
        });
      }

      const scopeSearch =
        typeof scopeRaw?.list_search === "string"
          ? scopeRaw.list_search
          : undefined;

      return invokeProjectsOperation("projects_list_tasks", {
        project_id: resolvedProjectId,
        phase_id: input.phase_id,
        assigned_to: input.assigned_to,
        status: input.status,
        scope: input.scope,
        search:
          input.search !== undefined && input.search !== ""
            ? input.search
            : scopeSearch,
        page: input.page,
        pageSize: input.pageSize,
        sortBy: input.sortBy,
        sortOrder: input.sortOrder,
      });
    },
  });
}
