import type { ToolExecutionContext } from "@engenty/ai-core";
import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const PROJECTS_MANAGE_TASK_TOOL_ID = "manage_project_task";

/** Create, update, or delete a project task via registered operations. */
export function buildManageProjectTaskTool(
  invokeProjectsOperation: PluginServerGatewayCaller["invokeOperation"],
  ctx?: ToolExecutionContext
) {
  return createTool({
    id: PROJECTS_MANAGE_TASK_TOOL_ID,
    description:
      "Create, update, or delete a task in a project. Requires project_id (falls back to scope.entityId). Update/delete require task_id. Status must be valid per project settings.",
    inputSchema: z.object({
      action: z.enum(["create", "update", "delete"]),
      project_id: z.string().optional().meta({
        description: "Project UUID; defaults to scope.entityId",
      }),
      task_id: z.string().optional().meta({
        description: "Task UUID; required for update and delete",
      }),
      data: z.record(z.string(), z.unknown()).optional().meta({
        description:
          "Task fields for create or patch for update (title, content, phase_id, discipline, hours, status, is_public, order_index, team_member_ids)",
      }),
    }),
    execute: async ({ action, project_id, task_id, data }) => {
      const scope = ctx?.scope as Record<string, unknown> | null | undefined;
      const scopeId = scope?.entityId;
      const resolvedProjectId =
        project_id ??
        (typeof scopeId === "string" && scopeId.length > 0
          ? scopeId
          : undefined);

      if (!resolvedProjectId) {
        return {
          error:
            "No project_id; open a project detail page or pass project_id explicitly.",
        };
      }

      if (action === "create") {
        if (!data?.title) {
          return { error: "title is required to create a task." };
        }
        return invokeProjectsOperation("projects_create_task", {
          project_id: resolvedProjectId,
          task: data,
        });
      }

      if (!task_id) {
        return { error: "task_id is required for update and delete." };
      }

      if (action === "delete") {
        return invokeProjectsOperation("projects_delete_task", {
          project_id: resolvedProjectId,
          task_id,
        });
      }

      // update
      return invokeProjectsOperation("projects_update_task", {
        project_id: resolvedProjectId,
        task_id,
        patch: data ?? {},
      });
    },
  });
}
