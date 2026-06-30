import type { ToolExecutionContext } from "@engenty/ai-core";
import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const PROJECTS_LOAD_PROJECT_TOOL_ID = "load_project";

/** Load one project with phases and tasks via registered operations. */
export function buildLoadProjectTool(
  invokeProjectsOperation: PluginServerGatewayCaller["invokeOperation"],
  ctx?: ToolExecutionContext
) {
  return createTool({
    id: PROJECTS_LOAD_PROJECT_TOOL_ID,
    description:
      "Load a single project by id, including phases and tasks (snake_case fields). If id is omitted, uses scope.entityId from the current project detail page.",
    inputSchema: z.object({
      id: z.string().min(1).optional().meta({
        description: "Project UUID; defaults to current project from scope",
      }),
    }),
    execute: async ({ id }) => {
      const scope = ctx?.scope as Record<string, unknown> | null | undefined;
      const scopeId = scope?.entityId;
      const projectId =
        id ??
        (typeof scopeId === "string" && scopeId.length > 0
          ? scopeId
          : undefined);
      if (!projectId) {
        return {
          error:
            "No project id; open a project detail page or pass id explicitly.",
        };
      }
      return invokeProjectsOperation("projects_get", { id: projectId });
    },
  });
}
