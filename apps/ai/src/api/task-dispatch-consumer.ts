// Phase 4 — the agent_task_dispatch consumer. Polls the dispatch queue and runs
// each message as a durable Task Job (the Mastra `task-job` workflow). This is the
// "heartbeat dispatcher" in Paperclip terms: it does NOT execute the agent itself —
// it starts the workflow, which checks the task out, runs the specialist, writes the
// result, and finalizes. Durability lives in the workflow snapshot; the consumer
// just kicks runs off (messages pop at-most-once; an in-flight run survives a crash
// via restartAllActiveWorkflowRuns on boot).

import { randomUUID } from "node:crypto";
import type { QueueService } from "@engenty/queue";
import { startQueueWorker } from "@engenty/queue";
import { createLogger } from "@engenty/telemetry";
import type { mastra as MastraInstance } from "../../ai/index.js";
import { TASK_JOB_WORKFLOW_ID } from "../../ai/workflows/task-job-workflow.js";
import { taskJobInputSchema } from "../ai/jobs/task-job-schema.js";

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
    const inputData = parsed.data;
    const workflow = options.mastra.getWorkflow(TASK_JOB_WORKFLOW_ID);
    const run = await workflow.createRun({ runId: randomUUID() });
    logger.info("running task job", {
      agentTypeKey: inputData.agent_type_key,
      readCount: meta.readCount,
      runId: run.runId,
      taskId: inputData.task_id,
    });
    const result = await run.start({ inputData });
    if (result.status === "success") {
      logger.info("task job finished", {
        runId: run.runId,
        status: result.result?.status,
        taskId: inputData.task_id,
      });
    } else {
      logger.error("task job did not succeed", {
        runId: run.runId,
        status: result.status,
        taskId: inputData.task_id,
        ...(result.status === "failed" ? { error: result.error?.message } : {}),
      });
    }
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
