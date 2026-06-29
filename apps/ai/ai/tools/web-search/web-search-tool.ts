import { buildMastraWebSearchTool } from "@engenty/ai-core";
import { createTool } from "@mastra/core/tools";

export function createWebSearchTool() {
  return buildMastraWebSearchTool(createTool);
}
