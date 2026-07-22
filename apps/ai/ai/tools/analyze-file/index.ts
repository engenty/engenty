import { analyzeFileTool } from "./analyze-file-tool.js";

export {
  ANALYZE_FILE_TOOL_ID,
  type AnalyzeFileMode,
  analyzeFileTool,
} from "./analyze-file-tool.js";

export function createAnalyzeFileTool() {
  return analyzeFileTool;
}
