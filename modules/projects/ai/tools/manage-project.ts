import type { ToolExecutionContext } from "@engenty/ai-core";
import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const PROJECTS_MANAGE_PROJECT_TOOL_ID = "manage_project";

/** Create, update, or delete a project via registered operations. */
export function buildManageProjectTool(
  invokeProjectsOperation: PluginServerGatewayCaller["invokeOperation"],
  ctx?: ToolExecutionContext
) {
  return createTool({
    id: PROJECTS_MANAGE_PROJECT_TOOL_ID,
    description:
      "Create, update, or delete a project. Action 'create' requires title; 'update' and 'delete' require id (falls back to scope.entityId from current project page).",
    inputSchema: z.object({
      action: z.enum(["create", "update", "delete"]),
      id: z.string().optional().meta({
        description:
          "Project UUID; required for update/delete, defaults to scope.entityId",
      }),
      data: z.record(z.string(), z.unknown()).optional().meta({
        description:
          "Project fields for create or patch for update (snake_case keys)",
      }),
    }),
    execute: async ({ action, id, data }) => {
      const scope = ctx?.scope as Record<string, unknown> | null | undefined;
      const scopeId = scope?.entityId;
      const projectId =
        id ??
        (typeof scopeId === "string" && scopeId.length > 0
          ? scopeId
          : undefined);

      if (action === "create") {
        if (!data?.title) {
          return { error: "title is required to create a project." };
        }
        return invokeProjectsOperation("projects_create", data);
      }

      if (!projectId) {
        return {
          error:
            "No project id; open a project detail page or pass id explicitly.",
        };
      }

      if (action === "delete") {
        return invokeProjectsOperation("projects_delete", { id: projectId });
      }

      // update
      return invokeProjectsOperation("projects_update", {
        id: projectId,
        patch: data ?? {},
      });
    },
  });
}
