// Code Mode over the engenty tool catalog (read-only).
//
// One `execute_typescript` tool: the model writes a single TypeScript program
// that orchestrates tools as `external_*` functions in the run's workspace
// sandbox — batching, filtering, and aggregation happen in code instead of N
// chat round-trips. v1 exposes the DISCOVERY meta-tools plus a READ-ONLY
// execute variant; write operations must go through the regular chat tool
// where the native approval gate applies. (The gate could not suspend from
// inside a program anyway — Code Mode dispatch has no agent context, so a
// gated op would just be denied.)
//
// Typed per-operation stubs generated from contract JSON schemas
// (jsonSchemaToTsString) are a later enhancement; the meta-tool loop already
// covers the bulk-orchestration win.
import type { ToolExecutionContext } from "@mastra/core/tools";
import { createCodeMode, createTool } from "@mastra/core/tools";
import { DockerCodeModeTransport } from "./code-mode-docker-transport.js";
import { executeEngentyTool } from "./engenty-tool-execute-tool.js";
import { engentyToolsSearchTool } from "./engenty-tools-search-tool.js";
import { runInputSchema } from "./schema/schemas.js";

/** Read-only execute: same contract-driven pipeline as engenty_tool_execute,
 * but non-read-only operations (risk above low, or approval-gated) are
 * rejected server-side — the allow-list is enforced here, not in the prompt. */
const engentyToolExecuteReadOnlyTool = createTool({
  id: "engenty_tool_execute_readonly",
  description:
    "Execute a READ-ONLY Engenty tool by id (low risk, no approval). Use engenty_tools_search first to find tool ids. Write operations are rejected — run those as regular chat tools.",
  inputSchema: runInputSchema,
  execute: async (input, context) =>
    executeEngentyTool(input, context as ToolExecutionContext | undefined, {
      enforceReadOnly: true,
    }),
});

const codeMode = createCodeMode(
  {
    id: "execute_typescript",
    tools: {
      engenty_tool_execute_readonly: engentyToolExecuteReadOnlyTool,
      engenty_tools_search: engentyToolsSearchTool,
    },
    // No explicit sandbox: the tool resolves `ctx.workspace.sandbox` at run
    // time, so Code Mode is only attached to agents assembled with a
    // sandbox-carrying workspace.
  },
  // Container-aware transport — the shipped stdio transport stages programs
  // on the HOST, which a Docker sandbox cannot see.
  new DockerCodeModeTransport()
);

export const engentyCodeModeTool = codeMode.tool;
export const engentyCodeModeInstructions = codeMode.instructions;
