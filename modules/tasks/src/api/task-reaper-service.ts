// Stale-checkout reaper (liveness enforcement).
//
// A task-job crash that outlives workflow resume leaves its task claimed
// forever: `checkout_run_id` set, status `in_progress`, and — because a
// claimed task is never dispatchable — no future checkout ever arrives to
// trigger the DAL's stale-replacement path. The reaper closes that hole: it
// walks claimed tasks, checks whether the backing `ai.agent_run` is still
// alive, and releases dead checkouts (comment + activity + re-dispatch), so
// no task is ever `in_progress` without a live run behind it.
//
// Invoked via the `tasks_reap_stale_checkouts` gateway op — the coordinator
// heartbeat routine calls it every cycle, and it is safe to run any time
// (releasing is idempotent and a live run is never touched).

import type { QueueServiceLike } from "@engenty/plugin-sdk";
import type { Task } from "../schema/types.js";
import {
  type DispatchRepo,
  dispatchTaskIfReady,
} from "./task-dispatch-service.js";

/** Agent principal attributed to reaper releases. */
const REAPER_ACTOR = "engenty.coordinator";

/**
 * A checkout whose run row is MISSING is only stale after this grace window
 * (measured against the task's updated_at): the run record is registered
 * seconds after checkout, but that write is best-effort and may lag.
 */
const MISSING_RUN_GRACE_MS = 30 * 60 * 1000;

export interface ReaperTasksRepo {
  addComment(
    taskId: string,
    content: string,
    opts?: { createdByAgentTypeKey?: string }
  ): Promise<unknown>;
  getCheckoutRunState(
    runId: string
  ): Promise<"running" | "finished" | "missing">;
  listClaimedTasks(): Promise<Task[]>;
  loadTaskStatuses(ids: string[]): Promise<Map<string, string | undefined>>;
  recordActivity(input: {
    task_id: string;
    event_type: string;
    payload?: Record<string, unknown>;
    actor_agent_type_key?: string | null;
  }): Promise<void>;
  releaseTask(
    taskId: string,
    input?: Record<string, never>,
    opts?: { actorAgentTypeKey?: string | null }
  ): Promise<Task | null>;
  updateTask(
    id: string,
    input: { status?: string },
    opts?: { actorKind?: "user" | "agent" }
  ): Promise<Task | null>;
}

export interface ReapStaleCheckoutsDeps {
  now?: () => number;
  queue?: QueueServiceLike | null;
  repo: ReaperTasksRepo;
  tenantId?: string | null;
}

export interface ReapStaleCheckoutsResult {
  checked: number;
  reaped: Array<{ id: string; identifier: string | null; run_id: string }>;
}

/**
 * Release every claimed task whose backing run is dead. Live runs are never
 * touched; a missing run row only counts as dead after a grace window.
 * Released tasks return to `todo` (releaseTask's semantics) and are
 * re-dispatched when a queue is available.
 */
export async function reapStaleCheckouts(
  deps: ReapStaleCheckoutsDeps
): Promise<ReapStaleCheckoutsResult> {
  const now = deps.now ?? Date.now;
  const claimed = await deps.repo.listClaimedTasks();
  const reaped: ReapStaleCheckoutsResult["reaped"] = [];

  for (const task of claimed) {
    const runId = task.checkout_run_id;
    if (!runId) {
      continue;
    }
    const state = await deps.repo.getCheckoutRunState(runId);
    if (state === "running") {
      continue;
    }
    if (state === "missing") {
      const updatedAt = Date.parse(task.updated_at);
      if (
        Number.isFinite(updatedAt) &&
        now() - updatedAt < MISSING_RUN_GRACE_MS
      ) {
        continue; // just checked out; the run record may still be on its way
      }
    }

    const released = await deps.repo.releaseTask(
      task.id,
      {},
      { actorAgentTypeKey: REAPER_ACTOR }
    );
    if (!released) {
      continue;
    }
    await deps.repo.addComment(
      task.id,
      `♻️ Released a stale checkout — run \`${runId}\` is no longer alive. The task is back in the queue.`,
      { createdByAgentTypeKey: REAPER_ACTOR }
    );
    await deps.repo.recordActivity({
      task_id: task.id,
      event_type: "tasks.checkout_reaped",
      payload: { run_id: runId, run_state: state },
      actor_agent_type_key: REAPER_ACTOR,
    });
    reaped.push({
      id: task.id,
      identifier: task.identifier ?? null,
      run_id: runId,
    });

    if (deps.queue && deps.tenantId) {
      await dispatchTaskIfReady(
        {
          queue: deps.queue,
          repo: deps.repo as unknown as DispatchRepo,
          tenantId: deps.tenantId,
        },
        released
      );
    }
  }

  return { checked: claimed.length, reaped };
}
