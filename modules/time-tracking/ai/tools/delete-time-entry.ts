import type { ToolExecutionContext } from "@engenty/ai-core";
import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const TIME_TRACKING_DELETE_ENTRY_TOOL_ID = "delete_time_entry";

const deleteEntryInputSchema = z.object({
  id: z.string().min(1).meta({
    description: "The UUID of the time entry to delete (required)",
  }),
});

/** Delete a time entry via registered operations. */
export function buildDeleteTimeEntryTool(
  invokeTimeTrackingOperation: PluginServerGatewayCaller["invokeOperation"],
  _ctx?: ToolExecutionContext
) {
  return createTool({
    id: TIME_TRACKING_DELETE_ENTRY_TOOL_ID,
    description: "Delete an existing time entry by id.",
    inputSchema: deleteEntryInputSchema,
    execute: async (input) =>
      invokeTimeTrackingOperation("time_tracking_entries_delete", {
        id: input.id,
      }),
  });
}
