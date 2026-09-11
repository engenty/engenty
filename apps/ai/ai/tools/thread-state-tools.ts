// Durable per-thread state for a data-authored agent — the same channel a
// function agent gets from `useThreadState` (`metadata.agent_state` on the
// thread), reached as a tool because a registry row has no render to hold
// hooks. A specialist that runs a multi-turn exercise on its desk chat needs
// somewhere to keep "which item, how many wrong" that survives the turn.
//
// Reading is NOT a tool: the snapshot rides the run's runtime instructions
// (runtime-instructions.ts), so the agent sees its state at the top of every
// turn instead of spending a call to fetch what it just wrote.
//
// Writes go through the ownership-checked merge, so a write against a thread
// the user does not own throws rather than silently losing state.
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  type AgentStateSessionStore,
  createSessionAgentStateChannel,
  createThreadStoreFromEnv,
} from "../../src/ai/index.js";
import { getEngentyToolsRunContext } from "./engenty-tools/lib/run-context.js";

export const THREAD_STATE_SET_TOOL_ID = "thread_state_set";

const inputSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .describe("State key, e.g. `current_tense` or `wrong_attempts`."),
  value: z
    .unknown()
    .describe("JSON value to store under the key. `null` clears the key."),
});

/**
 * The run's own thread: a delegated child keeps its state on its own thread,
 * never on the parent's, so two runs sharing a user-facing thread cannot
 * overwrite each other's keys.
 */
function resolveStateContext() {
  const ctx = getEngentyToolsRunContext();
  const threadId =
    ctx.orchestratorThreadId?.trim() || ctx.userFacingThreadId?.trim();
  const tenantId = ctx.tenantId?.trim();
  const userId = ctx.userId?.trim();
  if (!(threadId && tenantId && userId)) {
    return null;
  }
  return { tenantId, threadId, userId };
}

export function createThreadStateTools(
  /** Overrides the env store; the run lane always takes the default. */
  getStore: () => AgentStateSessionStore | null = createThreadStoreFromEnv
) {
  return {
    [THREAD_STATE_SET_TOOL_ID]: createTool({
      id: THREAD_STATE_SET_TOOL_ID,
      description:
        "Store a value under `key` in this conversation's durable state. It survives the turn and is shown back to you at the top of every following turn in this thread — use it for what you must remember to continue a multi-turn exercise (the current item, a score, what is already covered). Set `null` to clear a key. Not for chat replies, and not for facts that belong in a record.",
      inputSchema,
      execute: async (input) => {
        const context = resolveStateContext();
        if (!context) {
          return {
            ok: false,
            error:
              "This run has no thread to hold state — nothing was stored. Carry what you need in your reply instead.",
          };
        }
        const channel = createSessionAgentStateChannel(getStore);
        const state = await channel.load(context);
        const next = { ...state };
        if (input.value === null) {
          delete next[input.key];
        } else {
          next[input.key] = input.value;
        }
        await channel.persist(context, next);
        return { ok: true, key: input.key, state: next };
      },
    }),
  };
}
