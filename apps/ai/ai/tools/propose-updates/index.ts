import { buildProposeUpdatesTool } from "@engenty/ai-core";
import { createTool } from "@mastra/core/tools";

export function createProposeUpdatesTool() {
  return buildProposeUpdatesTool(createTool);
}
