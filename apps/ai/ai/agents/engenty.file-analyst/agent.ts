// First builtin converted to a function agent (PLAN-agent-hooks Phase 3).
// The hooks render into the same AgentConfig the old static object was —
// instructions stay in their own file (files are the content medium, D7).
// Conversion note: the old static `model` column carried a routing-flavored
// fallback that only applied on modelConfig-less dev paths; runtime
// resolution (no pin, no effort → the tenant chat model) is unchanged.
import type { AgentFnDescriptor } from "@engenty/ai-core";
import { useRegisteredTool } from "@engenty/ai-core";
import { ENGENTY_FILE_ANALYST_INSTRUCTIONS } from "./instructions.js";
import { ENGENTY_FILE_ANALYST_TOOL_IDS } from "./tools.js";

export const ENGENTY_FILE_ANALYST_AGENT_ID = "engenty.file-analyst";

export const engentyFileAnalystAgent: AgentFnDescriptor = {
  description:
    "File analyst for chat attachments and vault files. Reads, summarizes, answers questions, converts to markdown, and extracts structured info (CSV headers/rows, key-values, emails). Pass storage_key + goal in the brief.",
  fn: () => {
    for (const id of ENGENTY_FILE_ANALYST_TOOL_IDS) {
      useRegisteredTool(id);
    }
    return ENGENTY_FILE_ANALYST_INSTRUCTIONS;
  },
  id: ENGENTY_FILE_ANALYST_AGENT_ID,
  // A sub-agent that exists to be delegated to; may not own triggers.
  kind: "delegated",
  name: "File Analyst",
};
