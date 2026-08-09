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
      'Create, update, or delete a task in a project. Requires project_id (falls back to scope.entityId). Update/delete require task_id. Status must be valid per project settings. To create MORE THAN ONE task, use action "create_many" with the `tasks` array and pass every task in a single call — do not loop over action "create", which asks for approval once per task.',
    inputSchema: z.object({
      action: z.enum(["create", "create_many", "update", "delete"]),
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
      tasks: z.array(z.record(z.string(), z.unknown())).optional().meta({
        description:
          'For action "create_many": up to 100 task objects, each with the same fields as `data`. One approval covers the whole batch.',
      }),
    }),
    execute: async ({ action, project_id, task_id, data, tasks }) => {
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

      if (action === "create_many") {
        if (!tasks || tasks.length === 0) {
          return { error: "tasks must be a non-empty array for create_many." };
        }
        const missingTitle = tasks.findIndex((task) => !task?.title);
        if (missingTitle >= 0) {
          return {
            error: `Every task needs a title; tasks[${missingTitle}] has none.`,
          };
        }
        return invokeProjectsOperation("projects_create_tasks", {
          project_id: resolvedProjectId,
          tasks,
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
