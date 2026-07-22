import type { AgentConfig } from "@engenty/ai-core";
import { resolveChatModelId } from "@engenty/ai-core";
import { ENGENTY_FILE_ANALYST_INSTRUCTIONS } from "./instructions.js";
import { ENGENTY_FILE_ANALYST_TOOL_IDS } from "./tools.js";

export const ENGENTY_FILE_ANALYST_AGENT_ID = "engenty.file-analyst";

const fileAnalystModel = resolveChatModelId({ purpose: "routing" });

export const engentyFileAnalystAgentConfig: AgentConfig = {
  description:
    "File analyst for chat attachments and vault files. Reads, summarizes, answers questions, converts to markdown, and extracts structured info (CSV headers/rows, key-values, emails). Pass storage_key + goal in the brief.",
  id: ENGENTY_FILE_ANALYST_AGENT_ID,
  instructions: ENGENTY_FILE_ANALYST_INSTRUCTIONS,
  model: fileAnalystModel,
  name: "File Analyst",
  skillIds: [],
  source: "builtin",
  toolIds: ENGENTY_FILE_ANALYST_TOOL_IDS,
};
