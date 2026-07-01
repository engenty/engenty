import type { ToolExecutionContext } from "@engenty/ai-core";
import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const TIME_TRACKING_LOG_ENTRY_TOOL_ID = "log_time_entry";

const logEntryInputSchema = z.object({
  date: z.string().min(1).meta({
    description: "The date of the log entry in YYYY-MM-DD format (required)",
  }),
  hours: z.number().positive().meta({
    description: "The number of hours to log (positive number, required)",
  }),
  userId: z.string().optional().meta({
    description:
      "Optional user ID to log time for; defaults to the current authenticated user",
  }),
  notes: z.string().optional().meta({
    description: "Optional description or comments about the work done",
  }),
  projectId: z.string().optional().meta({
    description: "Optional project UUID link",
  }),
  phaseId: z.string().optional().meta({
    description: "Optional project phase UUID link",
  }),
  taskId: z.string().optional().meta({
    description: "Optional task UUID link",
  }),
  discipline: z.string().optional().meta({
    description: "Optional discipline (e.g. Development, Design)",
  }),
  manualProjectTitle: z.string().optional().meta({
    description:
      "Optional manual project title (only when project is unlinked/manual)",
  }),
  manualPhaseTitle: z.string().optional().meta({
    description: "Optional manual phase title",
  }),
  manualTaskTitle: z.string().optional().meta({
    description: "Optional manual task title",
  }),
});

/** Create a time entry via registered operations. */
export function buildLogTimeEntryTool(
  invokeTimeTrackingOperation: PluginServerGatewayCaller["invokeOperation"],
  _ctx?: ToolExecutionContext
) {
  return createTool({
    id: TIME_TRACKING_LOG_ENTRY_TOOL_ID,
    description:
      "Log/create a new time entry. Requires date (YYYY-MM-DD), hours, and a valid row identity (either projectId/taskId or manualProjectTitle/manualTaskTitle). Optional notes and discipline.",
    inputSchema: logEntryInputSchema,
    execute: async (input) => {
      const mapped = {
        date: input.date,
        hours: input.hours,
        user_id: input.userId,
        notes: input.notes,
        project_id: input.projectId,
        phase_id: input.phaseId,
        task_id: input.taskId,
        discipline: input.discipline,
        manual_project_title: input.manualProjectTitle,
        manual_phase_title: input.manualPhaseTitle,
        manual_task_title: input.manualTaskTitle,
      };
      return invokeTimeTrackingOperation(
        "time_tracking_entries_create",
        mapped
      );
    },
  });
}
