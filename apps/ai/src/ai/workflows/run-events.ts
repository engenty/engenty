// Live + durable run events for the PARENT graph run.
//
// The run-event pipeline (ai.agent_run_event + the in-process bus) was only
// ever written by agent runs, so a workflow run replayed as silence: the fire
// card that follows the parent sat on "Starting…" for the whole fire. The
// dispatcher now narrates the graph itself, in the same AG-UI vocabulary the
// stream consumers already speak: one TOOL_CALL_START/RESULT pair per graph
// step, RUN_FINISHED / RUN_ERROR at settle. A step's inner tool calls stay on
// its child run — the parent tells the story at graph altitude.
import { createLogger } from "@engenty/telemetry";
import { createAgentRunStoreFromEnv } from "../index.js";
import {
  markRunDone,
  markRunLive,
  publishRunEvent,
} from "../sessions/run-event-bus.js";

const logger = createLogger({ name: "graph-run-events" });

interface GraphRunEventTarget {
  runId: string;
  tenantId: string;
  threadId: string;
}

/** The step lifecycle slice of Mastra's `WorkflowStreamEvent` this reads. */
interface WatchedWorkflowEvent {
  payload?: {
    id?: string;
    stepCallId?: string;
  };
  type: string;
}

interface WatchableRun {
  watch(cb: (event: WatchedWorkflowEvent) => void): () => void;
}

async function nextSeqStart(target: GraphRunEventTarget): Promise<number> {
  try {
    const store = createAgentRunStoreFromEnv();
    if (!store) {
      return 0;
    }
    const rows = await store.listRunEventsByRunId({ runId: target.runId });
    return rows.length;
  } catch {
    return 0;
  }
}

function makeEmit(target: GraphRunEventTarget, startSeq: number) {
  let seq = startSeq;
  const store = createAgentRunStoreFromEnv();
  return (type: string, payload: Record<string, unknown>) => {
    const event = { type, ...payload };
    const eventSeq = seq;
    seq += 1;
    publishRunEvent(target.runId, { event: event as never, seq: eventSeq });
    // Durable half is best-effort telemetry: a flapping database must not
    // fail the workflow the events merely narrate.
    void store
      ?.appendRunEvent({
        eventType: type,
        payload: event,
        runId: target.runId,
        seq: eventSeq,
        tenantId: target.tenantId,
        threadId: target.threadId,
      })
      .catch((err: unknown) => {
        logger.warn("graph run event persist failed", {
          message: err instanceof Error ? err.message : String(err),
          runId: target.runId,
        });
      });
  };
}

/**
 * Narrate one drive of a graph run (a start or a resume) onto the run-event
 * lane. Call before `run.start`/`run.resume`; dispose with the returned
 * function once the drive settles. RUN_STARTED is emitted only on a fresh
 * run — a resume continues the story, it does not restart it.
 */
export async function watchGraphRunEvents(
  run: WatchableRun,
  target: GraphRunEventTarget
): Promise<() => void> {
  const startSeq = await nextSeqStart(target);
  const emit = makeEmit(target, startSeq);
  markRunLive(target.runId);
  if (startSeq === 0) {
    emit("RUN_STARTED", { runId: target.runId, threadId: target.threadId });
  }
  // A step's call id ties its RESULT to its START. `stepCallId` when Mastra
  // provides one; the step id is unique enough within one drive otherwise.
  const callIds = new Map<string, string>();
  const unwatch = run.watch((event) => {
    try {
      const stepId = event.payload?.id;
      if (!stepId) {
        return;
      }
      if (event.type === "workflow-step-start") {
        const callId = event.payload?.stepCallId || `step:${stepId}`;
        callIds.set(stepId, callId);
        emit("TOOL_CALL_START", {
          toolCallId: callId,
          toolCallName: stepId,
        });
        return;
      }
      if (
        event.type === "workflow-step-finish" ||
        event.type === "workflow-step-suspended" ||
        event.type === "workflow-step-waiting"
      ) {
        const callId = callIds.get(stepId);
        if (!callId) {
          return;
        }
        callIds.delete(stepId);
        emit("TOOL_CALL_RESULT", {
          content:
            event.type === "workflow-step-suspended"
              ? "waiting for a decision"
              : event.type === "workflow-step-waiting"
                ? "sleeping"
                : "done",
          toolCallId: callId,
        });
      }
    } catch (err) {
      // The narration must never take the workflow down with it.
      logger.warn("graph run event translation failed", {
        message: err instanceof Error ? err.message : String(err),
        runId: target.runId,
      });
    }
  });
  return unwatch;
}

/**
 * The run's last event, from the settle funnel — every path (first pass,
 * resume after an approval, wake from a sleep) ends here, so the stream ends
 * here too. Suspends and sleeps must NOT call this: the run continues.
 */
export async function emitGraphRunTerminal(
  target: GraphRunEventTarget,
  outcome: {
    reason?: string | null;
    status: "completed" | "failed" | "cancelled";
  }
): Promise<void> {
  try {
    const emit = makeEmit(target, await nextSeqStart(target));
    if (outcome.status === "failed") {
      emit("RUN_ERROR", { message: outcome.reason ?? "graph run failed" });
    } else {
      // A cancelled run ends cleanly — the consumer reads the status off the
      // result rather than treating the stop as an error.
      emit("RUN_FINISHED", {
        runId: target.runId,
        threadId: target.threadId,
        ...(outcome.status === "cancelled"
          ? { result: { status: "cancelled" } }
          : {}),
      });
    }
  } finally {
    markRunDone(target.runId);
  }
}
