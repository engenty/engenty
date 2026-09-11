// Comments that land WHILE a task's run is executing.
//
// A person watching an agent work and typing "actually, use the other address"
// had no way to be heard: the comment was written to the task (correctly — it
// is the collaboration record) and the running loop never saw it. The run
// finished on stale instructions, and the person's only recourse was to reject
// the result and dispatch again.
//
// This is the same shape as `run-abort-registry`: a live run publishes a way to
// be reached, an HTTP handler looks it up, and everything about the run's state
// of record still lives in Postgres. The registry holds a DELIVERY function,
// not a session — the conversation layer owns what "deliver" means (a Mastra
// `sendMessage` into the live agentic loop), and this file stays free of it.
//
// Keyed by TASK, not by run: the caller is looking at a task and knows nothing
// about which run currently holds it. Checkout is exclusive, so a task has at
// most one live run and the key is unambiguous.
import { createLogger } from "@engenty/telemetry";

const logger = createLogger({ name: "live-task-run-registry" });

interface LiveTaskRun {
  deliver: (content: string) => Promise<void>;
  runId: string;
}

const liveTaskRuns = new Map<string, LiveTaskRun>();

/**
 * Announce that this process is running `taskId` and can take messages for it.
 * Returns the cleanup the run MUST call when it ends — a stale entry would
 * accept a comment into a loop that is no longer draining it.
 */
export function registerLiveTaskRun(input: {
  deliver: (content: string) => Promise<void>;
  runId: string;
  taskId: string;
}): () => void {
  liveTaskRuns.set(input.taskId, {
    deliver: input.deliver,
    runId: input.runId,
  });
  return () => {
    // Only if it is still OURS: a later run for the same task may have
    // registered before this one's teardown ran.
    if (liveTaskRuns.get(input.taskId)?.runId === input.runId) {
      liveTaskRuns.delete(input.taskId);
    }
  };
}

/** The run currently executing this task in THIS process, if any. */
export function liveTaskRunId(taskId: string): string | null {
  return liveTaskRuns.get(taskId)?.runId ?? null;
}

/**
 * Hand `content` to the live run, if there is one here.
 *
 * `false` means "not delivered" for every reason — no live run, wrong replica,
 * the loop rejected it — and the caller falls back to what it did before
 * (park the task, dispatch a fresh run). A delivery that throws must not fail
 * the comment: the comment is already saved, and this is only its faster route.
 */
export async function deliverToLiveTaskRun(
  taskId: string,
  content: string
): Promise<boolean> {
  const live = liveTaskRuns.get(taskId);
  if (!live) {
    return false;
  }
  try {
    await live.deliver(content);
    return true;
  } catch (err) {
    logger.warn("live task-run delivery failed", {
      error: err instanceof Error ? err.message : String(err),
      runId: live.runId,
      taskId,
    });
    return false;
  }
}

/** Test seam — a module-level Map outlives a single test otherwise. */
export function resetLiveTaskRunsForTests(): void {
  liveTaskRuns.clear();
}
