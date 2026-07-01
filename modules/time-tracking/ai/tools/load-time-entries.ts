import type { ToolExecutionContext } from "@engenty/ai-core";
import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const TIME_TRACKING_LOAD_ENTRIES_TOOL_ID = "load_time_entries";

const loadEntriesInputSchema = z.object({
  dateFrom: z.string().min(1).meta({
    description: "Start date in YYYY-MM-DD format (required)",
  }),
  dateTo: z.string().min(1).meta({
    description: "End date in YYYY-MM-DD format (required)",
  }),
  userIds: z.array(z.string()).optional().meta({
    description: "Optional array of user IDs to filter by",
  }),
  projectIds: z.array(z.string()).optional().meta({
    description: "Optional array of project IDs to filter by",
  }),
  phaseIds: z.array(z.string()).optional().meta({
    description: "Optional array of phase IDs to filter by",
  }),
  taskIds: z.array(z.string()).optional().meta({
    description: "Optional array of task IDs to filter by",
  }),
  discipline: z.string().optional().meta({
    description: "Optional discipline to filter by (e.g., Development, Design)",
  }),
  includeManual: z.boolean().optional().meta({
    description:
      "Whether to include manual-only (unlinked) entries; defaults to true",
  }),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(500).optional(),
});

/** Search and list logged time entries via registered operations. */
export function buildLoadTimeEntriesTool(
  invokeTimeTrackingOperation: PluginServerGatewayCaller["invokeOperation"],
  _ctx?: ToolExecutionContext
) {
  return createTool({
    id: TIME_TRACKING_LOAD_ENTRIES_TOOL_ID,
    description:
      "Load logged time entries (hours and notes) in a date range for specified users, projects, tasks, or disciplines. Use when the user asks about how much time has been logged or details of logged work.",
    inputSchema: loadEntriesInputSchema,
    execute: async (input) => {
      const mapped = {
        date_from: input.dateFrom,
        date_to: input.dateTo,
        user_ids: input.userIds,
        project_ids: input.projectIds,
        phase_ids: input.phaseIds,
        task_ids: input.taskIds,
        discipline: input.discipline,
        include_manual: input.includeManual,
        page: input.page,
        page_size: input.pageSize,
      };
      return invokeTimeTrackingOperation("time_tracking_entries_list", mapped);
    },
  });
}
