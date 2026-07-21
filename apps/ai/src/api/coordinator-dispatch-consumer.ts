// The agent_coordinator_dispatch consumer (agent coordination). A "Hand to
// Coordinator" handoff on a goal (module side:
// modules/tasks/src/api/coordinator-dispatch-queue.ts) becomes a queue dispatch;
// this consumer runs engenty.coordinator headless on that goal
// (runDelegatedConversation — the same leaf-run primitive the task job and
// team-chat mentions use). The coordinator audits the goal, creates & assigns
// specialist tasks, and those auto-dispatch via the agent_task_dispatch queue.
// Queue name inlined so apps/ai keeps no build-time dependency on @engenty/tasks
// (same contract style as agent_task_dispatch).
import { randomUUID } from "node:crypto";
import type { QueueService } from "@engenty/queue";
import { startQueueWorker } from "@engenty/queue";
import { createLogger } from "@engenty/telemetry";
import { z } from "zod";
import { createDefaultAiRegistry } from "../ai/agents.js";
import { runDelegatedConversation } from "../ai/conversation/delegate-run.js";
import {
  createAgentSessionStoreFromEnv,
  createRegistryStoreFromEnv,
} from "../ai/index.js";
import { resolveTaskJobServiceScope } from "../ai/jobs/task-job-scope.js";
import { createDefaultModuleCapabilityLoader } from "../ai/module-capability-loader.js";
import { createSchedulerOperationInvoker } from "../scheduler/service-invoker.js";

const logger = createLogger({ name: "coordinator-dispatch-consumer" });

const AGENT_COORDINATOR_DISPATCH_QUEUE = "agent_coordinator_dispatch";
const COORDINATOR_AGENT_TYPE_KEY = "engenty.coordinator";

const coordinatorDispatchSchema = z.object({
  goal_id: z.string().min(1),
  tenant_id: z.string().min(1),
  triggered_by_user_id: z.string().nullish(),
});

function buildBrief(goal: {
  id: string;
  title: string;
  description: string | null;
}): string {
  return [
    `A human handed you the goal «${goal.title}» (goal_id: ${goal.id})${
      goal.description ? `\n\nGoal description:\n${goal.description}` : ""
    }`,
    "Run your coordinator-workflow for THIS goal only:",
    "1. Load the goal's existing tasks (tasks_list with this goal_id) and audit them.",
    "2. For each real gap, create a task (tasks_create) with goal_id set, primary_assignee_kind='agent', and primary_assignee_agent_type_key an EXACT id from registry_agents_list. Wire genuine dependencies with blocked_by_task_ids.",
    "3. Post a short summary comment on the goal's work and advance the goal status if everything is already complete.",
    "Do not touch any other goal. Act now — this is a headless run, so do not ask questions.",
  ].join("\n\n");
}

async function handleCoordinatorDispatch(
  payload: Record<string, unknown>
): Promise<void> {
  const dispatch = coordinatorDispatchSchema.parse(payload);
  const scope = await resolveTaskJobServiceScope(dispatch.tenant_id);
  const invoke = createSchedulerOperationInvoker();

  const goal = (await invoke("goals_get", { id: dispatch.goal_id })) as {
    id: string;
    title: string;
    description: string | null;
  } | null;
  if (!goal) {
    logger.warn("coordinator dispatch: goal not found", {
      goalId: dispatch.goal_id,
    });
    return;
  }

  const store = createAgentSessionStoreFromEnv();
  if (!store) {
    throw new Error("coordinator dispatch: agent session store not configured");
  }
  const registry = createDefaultAiRegistry({
    databaseStore: createRegistryStoreFromEnv(),
    moduleLoader: createDefaultModuleCapabilityLoader(),
    tenantId: dispatch.tenant_id,
  });
  // Stable per goal: repeat handoffs continue one ai.thread so the coordinator
  // keeps its memory of the goal.
  const childThreadId = `coordinator-goal-${dispatch.goal_id}`;

  const result = await runDelegatedConversation({
    // Headless: gated operations defer to core (durable approvals) instead of a
    // client-side deny.
    approvalPolicy: "defer",
    brief: buildBrief(goal),
    childAgentId: COORDINATOR_AGENT_TYPE_KEY,
    childRunId: randomUUID(),
    childThreadId,
    registry,
    scope,
    store,
  });

  if (result.error) {
    logger.error("coordinator dispatch run failed", {
      error: result.error,
      goalId: dispatch.goal_id,
    });
    return;
  }
  logger.info("coordinator dispatch completed", {
    goalId: dispatch.goal_id,
  });
}

export interface StartCoordinatorDispatchConsumerOptions {
  pollIntervalMs?: number;
  queue: QueueService;
}

/** Coordinator dispatch shares the task-dispatch kill-switch semantics. */
export function isCoordinatorDispatchEnabled(): boolean {
  return process.env.ENGENTY_AGENT_TASK_DISPATCH_ENABLED !== "false";
}

export function startCoordinatorDispatchConsumer(
  options: StartCoordinatorDispatchConsumerOptions
): () => void {
  if (!isCoordinatorDispatchEnabled()) {
    logger.info(
      "coordinator dispatch consumer disabled (ENGENTY_AGENT_TASK_DISPATCH_ENABLED)"
    );
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
  handlers.set(AGENT_COORDINATOR_DISPATCH_QUEUE, async (payload, meta) => {
    try {
      await handleCoordinatorDispatch(payload);
    } catch (err) {
      logger.error("coordinator dispatch failed", {
        message: err instanceof Error ? err.message : String(err),
        msgId: meta.msgId,
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
  logger.info("coordinator dispatch consumer started", {
    queue: AGENT_COORDINATOR_DISPATCH_QUEUE,
  });
  return stop;
}
