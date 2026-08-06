// Registers the dispatched Task Job as a first-class run in `ai.thread` +
// `ai.agent_run`, mirroring what the interactive session machinery does. Without
// this the task's `task_runs` row (written by checkout) enriches against a
// non-existent `ai.agent_run` row, so the UI's run history shows it stuck "in
// progress" forever. Creating the run (status running) at checkout and finishing
// it at the end gives the run card a real running → completed lifecycle and makes
// the run thread drillable.
import { createLogger } from "@engenty/telemetry";
import type { AgentRunStatus } from "../../dal/threads/types.js";
import {
  createAgentRunStoreFromEnv,
  createThreadStoreFromEnv,
} from "../index.js";
import { ensureAgentRunStarted } from "../sessions/run-tracking.js";
import type { AiSessionScope } from "../sessions/types.js";
import { scopeAttributionUserId } from "../sessions/types.js";

const logger = createLogger({ name: "task-job-run-record" });

export interface RegisterTaskJobRunInput {
  agentTypeKey: string;
  identifier?: string;
  runId: string;
  scope: AiSessionScope;
  taskId: string;
  threadId: string;
}

/**
 * Create the run's `ai.thread` (session) + `ai.agent_run` (status running). The
 * run id is the workflow run id — the same id checkout wrote as the task's
 * `checkout_run_id` and `task_runs.agent_session_run_id`, so the UI's run-history
 * enrichment resolves. No-op if the AI stores aren't configured.
 */
export async function registerTaskJobRun(
  input: RegisterTaskJobRunInput
): Promise<void> {
  const store = createThreadStoreFromEnv();
  const runStore = createAgentRunStoreFromEnv();
  if (!(store && runStore)) {
    return;
  }
  // Best-effort: the run record is for UI display only — a failure here must not
  // fail the task (which is already checked out). Degrades to "no run history".
  try {
    await store.upsertThread({
      agentId: input.agentTypeKey,
      createdByUserId: scopeAttributionUserId(input.scope),
      id: input.threadId,
      metadata: { source: "task-job" },
      routeContext: {
        entity_id: input.taskId,
        task_id: input.taskId,
        ...(input.identifier ? { task_identifier: input.identifier } : {}),
      },
      status: "running",
      tenantId: input.scope.tenantId,
      ...(input.identifier ? { title: `Task ${input.identifier}` } : {}),
    });
    await ensureAgentRunStarted(runStore, {
      agentId: input.agentTypeKey,
      createdByUserId: scopeAttributionUserId(input.scope),
      id: input.runId,
      tenantId: input.scope.tenantId,
      threadId: input.threadId,
    });
  } catch (err) {
    logger.warn("task-job run record registration failed", {
      error: err instanceof Error ? err.message : String(err),
      runId: input.runId,
      taskId: input.taskId,
    });
  }
}

/** Mark the run finished so the run-history card shows completed/failed. */
export async function finishTaskJobRun(input: {
  runId: string;
  scope: AiSessionScope;
  status: AgentRunStatus;
}): Promise<void> {
  const runStore = createAgentRunStoreFromEnv();
  if (!runStore) {
    return;
  }
  try {
    await runStore.finishRun({
      runId: input.runId,
      status: input.status,
      tenantId: input.scope.tenantId,
    });
  } catch (err) {
    logger.warn("task-job run record finish failed", {
      error: err instanceof Error ? err.message : String(err),
      runId: input.runId,
    });
  }
}
