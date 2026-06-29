import { buildConvertImageTool } from "@engenty/ai-core";
import { createTool } from "@mastra/core/tools";

export function createConvertImageTool() {
  return buildConvertImageTool(createTool);
}
