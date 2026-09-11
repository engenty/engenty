// Registers the dispatched Task Job as a first-class run in `ai.thread` +
// `ai.agent_run`, mirroring what the interactive session machinery does. Without
// this the task's `task_runs` row (written by checkout) enriches against a
// non-existent `ai.agent_run` row, so the UI's run history shows it stuck "in
// progress" forever. Creating the run (status running) at checkout and finishing
// it at the end gives the run card a real running → completed lifecycle and makes
// the run thread drillable.
import { createLogger } from "@engenty/telemetry";
import { preservedThreadUpsertFields } from "../../dal/threads/thread-upsert-preserve.js";
import type {
  AgentRunStatus,
  AgentRunTrigger,
} from "../../dal/threads/types.js";
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
  /** Why this run happened, as the dispatcher reported it. */
  startedBy?: AgentRunTrigger | null;
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
    // `threadIdForTaskActor` is STABLE, so run N re-upserts run N-1's thread —
    // which is the point ("run N opens on run N-1's memory"), and which the
    // RPC's wholesale `metadata = excluded.metadata` quietly undid: the
    // working-memory pointers and observational cursor live in that column, so
    // every checkout was throwing away the memory this thread exists to keep.
    // See thread-upsert-preserve.ts.
    const preserved = await preservedThreadUpsertFields({
      metadata: { source: "task-job" },
      store,
      tenantId: input.scope.tenantId,
      threadId: input.threadId,
    });
    await store.upsertThread({
      agentId: input.agentTypeKey,
      createdByUserId: scopeAttributionUserId(input.scope),
      id: input.threadId,
      ...preserved,
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
      trigger: input.startedBy ?? null,
    });
  } catch (err) {
    logger.warn("task-job run record registration failed", {
      error: err instanceof Error ? err.message : String(err),
      runId: input.runId,
      taskId: input.taskId,
    });
  }
}

/**
 * Mark the run finished so the run-history card shows completed/failed, and put
 * the thread back to rest.
 *
 * The thread status matters now that the thread is the actor's STANDING one for
 * the task rather than one run's scratch space: registration flips it to
 * `running` on every dispatch, and nothing else would ever flip it back, so a
 * task worked once would sit in every thread list as permanently running. The
 * run's own outcome (including `failed`) stays on `ai.agent_run`, which is what
 * the run-history card reads — the thread is only resting or working.
 */
export async function finishTaskJobRun(input: {
  runId: string;
  scope: AiSessionScope;
  status: AgentRunStatus;
  threadId?: string;
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
  const threadId = input.threadId;
  if (!threadId) {
    return;
  }
  const store = createThreadStoreFromEnv();
  if (!store) {
    return;
  }
  try {
    await store.setThreadStatus({
      status: "idle",
      tenantId: input.scope.tenantId,
      threadId,
    });
  } catch (err) {
    logger.warn("task-job thread status settle failed", {
      error: err instanceof Error ? err.message : String(err),
      threadId,
    });
  }
}
