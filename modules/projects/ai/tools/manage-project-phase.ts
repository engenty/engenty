import type { ToolExecutionContext } from "@engenty/ai-core";
import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const PROJECTS_MANAGE_PHASE_TOOL_ID = "manage_project_phase";

/** Create, update, or delete a project phase via registered operations. */
export function buildManageProjectPhaseTool(
  invokeProjectsOperation: PluginServerGatewayCaller["invokeOperation"],
  ctx?: ToolExecutionContext
) {
  return createTool({
    id: PROJECTS_MANAGE_PHASE_TOOL_ID,
    description:
      "Create, update, or delete a phase in a project. Requires project_id (falls back to scope.entityId). Update/delete require phase_id.",
    inputSchema: z.object({
      action: z.enum(["create", "update", "delete"]),
      project_id: z.string().optional().meta({
        description: "Project UUID; defaults to scope.entityId",
      }),
      phase_id: z.string().optional().meta({
        description: "Phase UUID; required for update and delete",
      }),
      data: z.record(z.string(), z.unknown()).optional().meta({
        description:
          "Phase fields for create or patch for update (title, start_date, end_date, is_main, is_public, order_index)",
      }),
    }),
    execute: async ({ action, project_id, phase_id, data }) => {
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
          return { error: "title is required to create a phase." };
        }
        return invokeProjectsOperation("projects_create_phase", {
          project_id: resolvedProjectId,
          phase: data,
        });
      }

      if (!phase_id) {
        return { error: "phase_id is required for update and delete." };
      }

      if (action === "delete") {
        return invokeProjectsOperation("projects_delete_phase", {
          project_id: resolvedProjectId,
          phase_id,
        });
      }

      // update
      return invokeProjectsOperation("projects_update_phase", {
        project_id: resolvedProjectId,
        phase_id,
        patch: data ?? {},
      });
    },
  });
}
