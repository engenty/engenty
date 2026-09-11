// A routine run's voice in the owner's chat — the headless equivalent of
// speaking in the room.
//
// The settle report guarantees a run says something at the END; these tools
// let it speak EARLIER. A long import can post its interim findings, and a run
// that hits a real question can ask it where the owner actually reads — the
// same thread the settle report resolves — instead of finishing mute and
// leaving the question buried in a run transcript.
//
// Same construction discipline as `task-self-tools`: bound to THIS run's
// routine at construction, attached as extraTools by `run_specialist` when the
// run context carries a routine id, never mountable from a Space, and never
// able to speak for another routine. `routine_ask` parks the run through the
// same suspension an approval uses — both mean "a human is needed".
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { createThreadStoreFromEnv } from "../../src/ai/index.js";
import { resolveRoutineOwnerThread } from "../../src/ai/routines/report-routine-run.js";
import { stableUuid } from "../../src/ai/workflows/dispatch-published-run.js";
import type { RoutineStore } from "../../src/dal/routines/routine-store.js";

export const ROUTINE_REPORT_TOOL_ID = "routine_report";
export const ROUTINE_ASK_TOOL_ID = "routine_ask";

export interface RoutineSelfToolsDeps {
  /** Attribution for the messages this run writes. */
  agentTypeKey: string;
  /**
   * Called when the agent asks the human something. The node suspends on this
   * signal rather than the tool throwing — a throw would land as a tool error
   * the model would try to work around.
   */
  onQuestion: (question: string) => void;
  routineId: string;
  routines: Pick<RoutineStore, "get">;
  runId: string;
  tenantId: string;
}

/** The brief section that tells a specialist these exist. */
export const ROUTINE_SELF_TOOLS_GUIDANCE = `## Reporting & questions
- Post interim findings and partial results with \`${ROUTINE_REPORT_TOOL_ID}\` — they land in your owner's chat as you work, so a long run is visible while it runs. Your final result is reported automatically when the run ends; do not repeat it through this tool.
- Need a decision or a missing detail to continue? Call \`${ROUTINE_ASK_TOOL_ID}\` with ONE concrete question, then STOP. The run parks until the owner answers in the chat, and resumes with their answer. Never guess a requirement you could ask about, and never ask for something you can look up yourself.`;

export function createRoutineSelfTools(deps: RoutineSelfToolsDeps) {
  // Resolved once per run, lazily: the tools may never be called, and the
  // routine row + owner chat lookup should not tax a run that stays quiet.
  let destination: Promise<string | null> | null = null;
  const resolveDestination = () => {
    destination ??= (async () => {
      const store = createThreadStoreFromEnv();
      if (!store) {
        return null;
      }
      const routine = await deps.routines.get({
        id: deps.routineId,
        tenantId: deps.tenantId,
      });
      if (!routine) {
        return null;
      }
      return await resolveRoutineOwnerThread({ routine, store });
    })();
    return destination;
  };

  let noteCount = 0;
  const post = async (text: string): Promise<boolean> => {
    const store = createThreadStoreFromEnv();
    const threadId = await resolveDestination();
    if (!(store && threadId)) {
      return false;
    }
    noteCount += 1;
    await store.appendMessage({
      authorUserId: null,
      // Derived from the run and a counter, so a replayed step upserts its own
      // note instead of posting it twice.
      id: stableUuid(`routine-note:${deps.runId}:${noteCount}`),
      metadata: {
        routine_id: deps.routineId,
        run_id: deps.runId,
        source: "routine-report",
      },
      parts: [{ text, type: "text" }],
      role: "assistant",
      tenantId: deps.tenantId,
      threadId,
    });
    return true;
  };

  const routineReport = createTool({
    id: ROUTINE_REPORT_TOOL_ID,
    description:
      "Post an interim finding or partial result into your owner's chat while you work. Markdown is rendered. Use it for progress worth seeing mid-run — your final result is reported automatically at the end, so do not repeat it here.",
    inputSchema: z.object({
      message: z.string().min(1).max(20_000),
    }),
    outputSchema: z.object({ posted: z.boolean() }),
    execute: async (input) => {
      const posted = await post(`**${deps.agentTypeKey}**\n\n${input.message}`);
      return { posted };
    },
  });

  const routineAsk = createTool({
    id: ROUTINE_ASK_TOOL_ID,
    description:
      "Ask the routine's owner a question you cannot answer yourself, then end your turn. The question is posted into their chat, the run parks, and their answer resumes it. Ask ONE concrete question and include the context needed to answer it.",
    inputSchema: z.object({
      /** What you already did, so the reply is informed. */
      context: z.string().max(4000).optional(),
      question: z.string().min(1).max(4000),
    }),
    outputSchema: z.object({ asked: z.boolean() }),
    execute: async (input) => {
      const body = input.context?.trim()
        ? `${input.question}\n\n${input.context.trim()}`
        : input.question;
      await post(`**${deps.agentTypeKey} — needs your answer**\n\n${body}`);
      deps.onQuestion(input.question);
      return { asked: true };
    },
  });

  return {
    [ROUTINE_ASK_TOOL_ID]: routineAsk,
    [ROUTINE_REPORT_TOOL_ID]: routineReport,
  };
}
