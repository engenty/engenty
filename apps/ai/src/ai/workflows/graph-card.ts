// A graph node's card, delivered where a person will see it.
//
// A card renders from a TOOL PART on a persisted assistant message — that is
// what `isA2uiToolPart` / `isObjectRenderToolPart` match on. A graph run writes
// no such message: its narration lane (`run-events.ts`) carries
// `TOOL_CALL_RESULT` with `content: "done"`, a string with no output and no
// `_meta`. So a node that renders has to append the message itself.
//
// It goes into the SPECIALIST'S CHAT, not the run's own thread. The run thread
// is the record of a fire and nobody opens it on purpose; the desk chat is the
// room the person already lands in. Same destination the routine settle report
// and `routine_report` use, so one run's story stays in one place.
import { createLogger } from "@engenty/telemetry";
import type { RoutineStore } from "../../dal/routines/routine-store.js";
import { createThreadStoreFromEnv } from "../index.js";
import { resolveRoutineOwnerThread } from "../routines/report-routine-run.js";
import { resolveSpecialistChatThread } from "../threads/specialist-chat-thread.js";
import { stableUuid } from "./dispatch-published-run.js";
import type { GraphRunContext } from "./run-context.js";

const logger = createLogger({ name: "graph-card" });

export interface AppendGraphCardInput {
  /** The stored entry that rendered — half of the card's stable id. */
  entryId: string;
  /** What the tool was given, shown as the call's input on the card. */
  input: unknown;
  /** The tool result, `_meta` marker included. This is what renders. */
  output: unknown;
  /** Tool id, so the part reads `tool-show_ui` and the card matches by name. */
  primitiveId: string;
  routines?: RoutineStore | null;
  runCtx: GraphRunContext;
}

/**
 * Where this run's cards go: the owner's chat with the run's specialist, and
 * the run's own thread when there is no specialist to speak for.
 *
 * A fire resolves through the routine (its owner and Space are on the routine
 * row); anything else resolves through the desk agent the dispatcher recorded.
 */
async function resolveCardThread(
  runCtx: GraphRunContext,
  routines: RoutineStore | null | undefined
): Promise<string | null> {
  const store = createThreadStoreFromEnv();
  if (!store) {
    return null;
  }
  if (runCtx.routineId && routines) {
    const routine = await routines.get({
      id: runCtx.routineId,
      tenantId: runCtx.tenantId,
    });
    if (routine) {
      const thread = await resolveRoutineOwnerThread({ routine, store });
      if (thread) {
        return thread;
      }
    }
  }
  if (runCtx.deskAgentId) {
    const thread = await resolveSpecialistChatThread({
      agentId: runCtx.deskAgentId,
      ownerUserId: runCtx.userId ?? null,
      spaceId: runCtx.space?.spaceId ?? null,
      store,
      tenantId: runCtx.tenantId,
      threadSeed: `action-desk-thread:${runCtx.workflowId}:${runCtx.userId}`,
      title: "Actions",
    });
    if (thread) {
      return thread;
    }
  }
  // No desk to speak into. The run's own thread is a log, but a card in a log
  // beats a card nowhere — the run view renders the same parts.
  return runCtx.threadId || null;
}

/**
 * Append one card. Best-effort by design: the node's work already happened, and
 * a delivery failure must not fail the run — but it is logged loudly, because
 * a silently undelivered card is indistinguishable from a node that did
 * nothing.
 */
export async function appendGraphCard(
  input: AppendGraphCardInput
): Promise<{ posted: boolean; threadId?: string }> {
  const { entryId, output, primitiveId, runCtx } = input;
  try {
    const store = createThreadStoreFromEnv();
    const threadId = await resolveCardThread(runCtx, input.routines);
    if (!(store && threadId)) {
      return { posted: false };
    }
    // Derived from the run and the entry, so a resumed or replayed step upserts
    // its own card instead of posting a second one.
    const cardId = stableUuid(`graph-card:${runCtx.requestId}:${entryId}`);
    await store.appendMessage({
      authorUserId: null,
      id: cardId,
      metadata: {
        workflow_id: runCtx.workflowId,
        request_id: runCtx.requestId,
        source: "graph-card",
      },
      parts: [
        {
          input: input.input,
          output,
          state: "output-available",
          toolCallId: cardId,
          type: `tool-${primitiveId}`,
        },
      ],
      role: "assistant",
      tenantId: runCtx.tenantId,
      threadId,
    });
    return { posted: true, threadId };
  } catch (err) {
    logger.warn("graph card delivery failed", {
      entryId,
      workflowId: runCtx.workflowId,
      message: err instanceof Error ? err.message : String(err),
      primitiveId,
    });
    return { posted: false };
  }
}
