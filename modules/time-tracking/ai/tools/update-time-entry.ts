import type { ToolExecutionContext } from "@engenty/ai-core";
import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const TIME_TRACKING_UPDATE_ENTRY_TOOL_ID = "update_time_entry";

const updateEntryInputSchema = z.object({
  id: z.string().min(1).meta({
    description: "The UUID of the time entry to update (required)",
  }),
  hours: z.number().positive().optional().meta({
    description: "New number of hours",
  }),
  notes: z.string().optional().meta({
    description: "New description/notes for the entry",
  }),
  discipline: z.string().optional().meta({
    description:
      "New discipline name (e.g., Development, Design) or empty string to clear",
  }),
});

/** Update an existing time entry via registered operations. */
export function buildUpdateTimeEntryTool(
  invokeTimeTrackingOperation: PluginServerGatewayCaller["invokeOperation"],
  _ctx?: ToolExecutionContext
) {
  return createTool({
    id: TIME_TRACKING_UPDATE_ENTRY_TOOL_ID,
    description:
      "Update an existing time entry's hours, notes, or discipline. Use when modifying existing logs.",
    inputSchema: updateEntryInputSchema,
    execute: async (input) => {
      const mapped = {
        id: input.id,
        hours: input.hours,
        notes: input.notes,
        discipline: input.discipline === "" ? null : input.discipline,
      };
      return invokeTimeTrackingOperation(
        "time_tracking_entries_update",
        mapped
      );
    },
  });
}
