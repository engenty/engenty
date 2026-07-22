import { buildCleanupCsvTool } from "@engenty/import/server";
import { createTool } from "@mastra/core/tools";

export { CLEANUP_CSV_TOOL_ID } from "@engenty/import/server";

export function createCleanupCsvTool() {
  return buildCleanupCsvTool(createTool);
}
