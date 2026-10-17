// Code Mode over the engenty tool catalog.
//
// One `execute_typescript` tool: the model writes a single TypeScript program
// that orchestrates tools as `external_*` functions — batching, filtering, and
// aggregation happen in code instead of N chat round-trips. The program runs
// in QuickJS compiled to WebAssembly, inside this process: no files, network,
// process, timers or modules, a fresh heap per program, and no sandbox
// container. Its only way out are the two tools below, which run here exactly
// as when the model calls them.
//
// The program sees the DISCOVERY search plus a sandbox-gated execute: reads and
// grant-covered writes run; a gated write with no covering grant fails INTO the
// program with the recovery path (engenty_tools_preapprove in chat → one card
// grants the program's write set → re-run). The gate cannot suspend from inside
// a program — Code Mode dispatch has no agent context — which is exactly why
// grants must pre-exist; core stays authoritative behind the local gate either
// way (its 202 maps to the same structured error).
import type { ToolsInput } from "@mastra/core/agent";
import type { ToolExecutionContext } from "@mastra/core/tools";
import {
  createCodeMode,
  createCodeModeTool,
  createTool,
  noopObserve,
} from "@mastra/core/tools";
import { QuickJsCodeModeTransport } from "@mastra/quickjs";
import type { z } from "zod";
import { CODE_MODE_PLAN_INSTRUCTIONS } from "./code-mode-plan-instructions.js";
import { capCodeModeOutcome } from "./code-mode-result-budget.js";
import { executeEngentyTool } from "./engenty-tool-execute-tool.js";
import { engentyToolsSearchTool } from "./engenty-tools-search-tool.js";
import { engentyToolsRunAls } from "./lib/run-context.js";
import { runInputSchema } from "./schema/schemas.js";

export interface CodeModeLimits {
  /** Characters of one tool answer a program takes in. */
  answerChars: number;
  /** Tool calls one program may make. */
  maxCalls: number;
  /** Tool calls of one program running at the same time. */
  maxParallel: number;
  /** Tool calls all programs of one run may make together. */
  runCalls: number;
  /** Wall time of one program, its tool calls included. */
  timeoutMs: number;
}

export const CODE_MODE_LIMITS: CodeModeLimits = {
  // QuickJS 0.31 can abort while it frees a runtime that parsed a tool answer
  // of ~1.6 MB (800 KB measured fine); this stays well below.
  answerChars: 200_000,
  maxCalls: 100,
  maxParallel: 4,
  // The model may run one program per turn; the run as a whole stops here.
  runCalls: 300,
  timeoutMs: 120_000,
};

const CODE_MODE_TOOL_ID = "execute_typescript";

/** Heap of one program's QuickJS runtime. */
const MEMORY_LIMIT_MB = 64;

/** One transport per process; it loads the WebAssembly module on first use. */
let transport: QuickJsCodeModeTransport | null = null;
function quickJs(): QuickJsCodeModeTransport {
  transport ??= new QuickJsCodeModeTransport({
    memoryLimitMb: MEMORY_LIMIT_MB,
  });
  return transport;
}

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

const ENGENTY_CODE_MODE_TOOLS: ToolsInput = {
  engenty_tool_execute: engentyToolExecuteSandboxTool,
  engenty_tools_search: engentyToolsSearchTool,
};

/** Tool calls the programs of one run have made, keyed by the run's context. */
const runCallCounts = new WeakMap<object, { calls: number }>();

function runCallCount(context: ToolExecutionContext | undefined): {
  calls: number;
} {
  // One run context per agent run; a direct call outside a run has none.
  const key = engentyToolsRunAls.getStore() ?? context?.requestContext;
  if (!key) {
    return { calls: 0 };
  }
  let count = runCallCounts.get(key);
  if (!count) {
    count = { calls: 0 };
    runCallCounts.set(key, count);
  }
  return count;
}

/** Runs at most `max` tasks at a time; the others wait their turn. */
function limiter(max: number) {
  let running = 0;
  const waiting: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (running >= max) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    running += 1;
    try {
      return await task();
    } finally {
      running -= 1;
      waiting.shift()?.();
    }
  };
}

interface ExecutableTool {
  execute: (input: unknown, options: unknown) => Promise<unknown>;
}

/**
 * Wraps each tool for one program: the calls of the program and of the run and
 * the calls in flight are capped, and an oversized answer never enters QuickJS.
 * A refusal is thrown, so it rejects the program's `external_*` promise.
 */
function guarded(
  tools: ToolsInput,
  limits: CodeModeLimits,
  run: { calls: number },
  abortSignal: AbortSignal | undefined
): ToolsInput {
  let calls = 0;
  const slot = limiter(limits.maxParallel);
  return Object.fromEntries(
    Object.entries(tools).map(([key, tool]) => [
      key,
      {
        ...(tool as object),
        execute: (input: unknown, options: unknown) => {
          calls += 1;
          run.calls += 1;
          if (calls > limits.maxCalls) {
            throw new Error(
              `A program makes at most ${limits.maxCalls} tool calls. Split the work.`
            );
          }
          if (run.calls > limits.runCalls) {
            throw new Error(
              `The programs of this run have made ${limits.runCalls} tool calls, all a run may make. Finish with what you have.`
            );
          }
          if (abortSignal?.aborted) {
            throw new Error("The run was stopped.");
          }
          return slot(async () => {
            const answer = await (tool as ExecutableTool).execute(
              input,
              options
            );
            const size = JSON.stringify(answer ?? null)?.length ?? 0;
            if (size > limits.answerChars) {
              throw new Error(
                `${key} answered ${size} characters; a program takes at most ${limits.answerChars} from one call. Ask for less (filter, limit, fewer fields) or call it directly.`
              );
            }
            return answer;
          });
        },
      },
    ])
  ) as ToolsInput;
}

type CodeModeOutcome = Parameters<typeof capCodeModeOutcome>[0];

/** The `execute_typescript` tool over `tools`, and how to write a program. */
export function createEngentyCodeMode(
  tools: ToolsInput = ENGENTY_CODE_MODE_TOOLS,
  limits: CodeModeLimits = CODE_MODE_LIMITS
) {
  const config = { id: CODE_MODE_TOOL_ID, timeout: limits.timeoutMs, tools };
  // Instructions list the tools once; every program runs over fresh guards.
  const { tool: base, instructions } = createCodeMode(config, quickJs());
  const tool = createTool({
    id: CODE_MODE_TOOL_ID,
    description: base.description,
    inputSchema: base.inputSchema as z.ZodType<{ code: string }>,
    execute: async (input, context) => {
      const run = createCodeModeTool(
        {
          ...config,
          tools: guarded(
            tools,
            limits,
            runCallCount(context),
            context?.abortSignal
          ),
        },
        quickJs()
      );
      let outcome: CodeModeOutcome;
      try {
        // Mastra's tool calls `observe.span` unguarded; a call outside a
        // traced run has no observe.
        outcome = (await run.execute?.(input, {
          ...context,
          observe: context?.observe ?? noopObserve,
        })) as CodeModeOutcome;
      } catch (error) {
        // QuickJS can fail while it frees a runtime that worked through a
        // large tool answer; the result is lost, the next program runs fresh.
        const message = error instanceof Error ? error.message : String(error);
        return {
          error: {
            message: `The program could not finish (${message.slice(0, 120)}). Work on smaller pieces: return less from each step, or call the tool directly.`,
          },
          logs: [],
          success: false,
        };
      }
      // The value flows straight into thread history from here.
      return capCodeModeOutcome(outcome);
    },
  });
  return {
    instructions: `${instructions}\n\nA program makes at most ${limits.maxCalls} tool calls, ${limits.maxParallel} at a time, and stops after ${limits.timeoutMs / 1000} seconds; all programs of one run together make at most ${limits.runCalls}. A tool answer over ${limits.answerChars} characters is refused inside a program — ask for less.`,
    tool,
  };
}

const engentyCodeMode = createEngentyCodeMode();

export const engentyCodeModeTool = engentyCodeMode.tool;

// Mastra's generated instructions describe HOW to write a program; they cannot
// know that this deployment's dispatch is read-only. Without the plan-then-apply
// doctrine the model treats the return value as a data channel and hands the
// next turn an entire dataset.
export const engentyCodeModeInstructions = `${engentyCodeMode.instructions}\n\n${CODE_MODE_PLAN_INSTRUCTIONS}`;
