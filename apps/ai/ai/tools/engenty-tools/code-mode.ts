// Code Mode over the engenty tool catalog.
//
// One `execute_typescript` tool: the model writes a single TypeScript program
// that orchestrates tools as `external_*` functions in the run's workspace
// sandbox — batching, filtering, and aggregation happen in code instead of N
// chat round-trips. The sandbox exposes the DISCOVERY search plus a
// sandbox-gated execute: reads and grant-covered writes run; a gated write
// with no covering grant fails INTO the program with the recovery path
// (engenty_tools_preapprove in chat → one card grants the program's write set
// → re-run). The gate cannot suspend from inside a program — Code Mode
// dispatch has no agent context — which is exactly why grants must pre-exist;
// core stays authoritative behind the local gate either way (its 202 maps to
// the same structured error).
//
// Typed per-operation stubs generated from contract JSON schemas
// (jsonSchemaToTsString) are a later enhancement; the meta-tool loop already
// covers the bulk-orchestration win.
import type { ToolExecutionContext } from "@mastra/core/tools";
import { createCodeMode, createTool } from "@mastra/core/tools";
import { DockerCodeModeTransport } from "./code-mode-docker-transport.js";
import { CODE_MODE_PLAN_INSTRUCTIONS } from "./code-mode-plan-instructions.js";
import { executeEngentyTool } from "./engenty-tool-execute-tool.js";
import { engentyToolsSearchTool } from "./engenty-tools-search-tool.js";
import { runInputSchema } from "./schema/schemas.js";

/** Sandbox execute: same contract-driven pipeline as engenty_tool_execute, but
 * gated operations (requiresApproval, or high/critical risk) run only when a
 * pre-existing grant covers them — the gate is enforced here, not in the
 * prompt, and it cannot prompt (no suspend from a running program). */
const engentyToolExecuteSandboxTool = createTool({
  id: "engenty_tool_execute",
  description:
    "Execute an Engenty tool by id. Reads run directly; write operations need a grant — " +
    "request one BEFORE running the program via engenty_tools_preapprove in chat. " +
    "Use engenty_tools_search first to find tool ids.",
  inputSchema: runInputSchema,
  execute: async (input, context) =>
    executeEngentyTool(input, context as ToolExecutionContext | undefined, {
      sandbox: true,
    }),
});

const codeMode = createCodeMode(
  {
    id: "execute_typescript",
    tools: {
      engenty_tool_execute: engentyToolExecuteSandboxTool,
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

// Mastra's generated instructions describe HOW to write a program; they cannot
// know that this deployment's dispatch is read-only. Without the plan-then-apply
// doctrine the model treats the return value as a data channel and hands the
// next turn an entire dataset.
export const engentyCodeModeInstructions = `${codeMode.instructions}\n\n${CODE_MODE_PLAN_INSTRUCTIONS}`;
