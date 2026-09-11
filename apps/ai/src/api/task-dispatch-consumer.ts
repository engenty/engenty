// The agent_task_dispatch consumer — the doorbell between two processes.
//
// The queue survives Phase 8 for one reason: `dispatchTaskIfReady` runs in CORE,
// which has no Mastra instance, so something has to carry "run this task" across
// the process boundary. What it no longer carries is durability — the consumer
// hands the message to the background-task manager, which persists it, owns its
// retries and re-dispatches it after a crash, and then ACKS. Awaiting the whole
// run here would only mean a redelivery timer racing a substrate that already
// guarantees the run.
//
// At-least-once delivery stays safe the same way it always was: a redelivered
// message for an already-checked-out task hits checkout 409 → envelope `skipped`
// → every downstream step no-ops.

import type { QueueService } from "@engenty/queue";
import { startQueueWorker } from "@engenty/queue";
import { createLogger } from "@engenty/telemetry";
import type { mastra as MastraInstance } from "../../ai/index.js";
import { taskJobInputSchema } from "../ai/jobs/task-job-schema.js";
import { startTaskJob } from "./task-background-dispatch.js";

const logger = createLogger({ name: "task-dispatch-consumer" });

// Queue name shared with the tasks module (`AGENT_TASK_DISPATCH_QUEUE`). Inlined
// so apps/ai keeps no build-time dependency on @engenty/tasks — same contract the
// task-workspace-hook and dispatch-routes already duplicate.
const AGENT_TASK_DISPATCH_QUEUE = "agent_task_dispatch";

export interface StartTaskDispatchConsumerOptions {
  mastra: typeof MastraInstance;
  pollIntervalMs?: number;
  queue: QueueService;
}

/** Dispatch is on unless explicitly disabled via the kill-switch. */
export function isTaskDispatchEnabled(): boolean {
  return process.env.ENGENTY_AGENT_TASK_DISPATCH_ENABLED !== "false";
}

/**
 * Start the dispatch consumer. Returns a stop function. A no-op (and no polling)
 * when the kill-switch is off.
 */
export function startTaskDispatchConsumer(
  options: StartTaskDispatchConsumerOptions
): () => void {
  if (!isTaskDispatchEnabled()) {
    logger.info("task dispatch disabled (ENGENTY_AGENT_TASK_DISPATCH_ENABLED)");
    return () => {
      // nothing to stop
    };
  }

  const handlers = new Map<
    string,
    (
      payload: Record<string, unknown>,
      meta: { msgId: number; readCount: number }
    ) => Promise<void>
  >();
  handlers.set(AGENT_TASK_DISPATCH_QUEUE, async (payload, meta) => {
    const parsed = taskJobInputSchema.safeParse(payload);
    if (!parsed.success) {
      logger.error("dropping malformed dispatch message", {
        issues: parsed.error.issues,
        msgId: meta.msgId,
      });
      return;
    }
    // Enqueue and ack. The run's lifetime is the background task's business
    // from here — including surviving this process.
    const started = await startTaskJob(options.mastra, parsed.data);
    started.done.catch(() => {
      // already logged where it happened
    });
    logger.info("dispatched from queue", {
      readCount: meta.readCount,
      runId: started.runId,
      taskId: parsed.data.task_id,
    });
  });

  const stop = startQueueWorker({
    handlers,
    queue: options.queue,
    ...(options.pollIntervalMs
      ? { pollIntervalMs: options.pollIntervalMs }
      : {}),
  });
  logger.info("task dispatch consumer started", {
    queue: AGENT_TASK_DISPATCH_QUEUE,
  });
  return stop;
}
