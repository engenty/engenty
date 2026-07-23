// "Run this task now" — the explicit human ask behind the task detail page's
// work-on-task button.
//
// The button used to open a client-side agent stream: the run id was minted in
// the browser, so nothing on the server ever knew the run existed. It left no
// workflow snapshot, no ai.agent_run, no task_runs row and no checkout — the
// run died on reload, produced no run history, and (worst) left the task at
// `in_progress` with a NULL checkout, which is precisely the shape the stale
// checkout reaper cannot see. A tab that closed stranded the task forever.
//
// Pressing the button now enqueues the task on the SAME durable path a routine
// or coordinator dispatch uses: task-job workflow (snapshotted, resumed on
// boot) → checkout → run record → release. The UI then observes that run and
// can re-attach to it after a reload.
//
// Kept behind the small repo interfaces so it unit-tests with in-memory fakes.

import type { QueueServiceLike } from "@engenty/plugin-sdk";
import {
  TASK_AGENT_CHECKOUT_ENTRY_STATUSES,
  TASK_TERMINAL_STATUSES,
} from "../domain/task-lifecycle.js";
import type { Task } from "../schema/types.js";
import {
  type DispatchRepo,
  dispatchTaskIfReady,
} from "./task-dispatch-service.js";

export interface RunTaskNowRepo extends DispatchRepo {
  getTask(id: string): Promise<Task | null>;
}

export interface RunTaskNowDeps {
  actorUserId?: string | null;
  queue?: QueueServiceLike | null;
  repo: RunTaskNowRepo;
  tenantId?: string | null;
}

export interface RunTaskNowResult {
  /** False when the task was already claimed — the live run is returned as-is. */
  dispatched: boolean;
  task: Task;
}

/**
 * Queue a task for an agent run right now. Idempotent: a task already claimed
 * by a live run is left alone and reported as not dispatched.
 *
 * Throws `task_not_found`, `task_not_agent_assigned`, `task_terminal`, or
 * `task_dispatch_unavailable`.
 */
export async function runTaskNow(
  deps: RunTaskNowDeps,
  input: { taskId: string }
): Promise<RunTaskNowResult> {
  const task = await deps.repo.getTask(input.taskId);
  if (!task) {
    throw new Error("task_not_found");
  }
  // Only an agent-assigned task has a runner. The UI hides the button in the
  // other cases; refusing here keeps the op honest for non-UI callers rather
  // than silently reassigning someone else's task to an agent.
  if (task.primary_assignee_kind !== "agent") {
    throw new Error("task_not_agent_assigned");
  }
  if (TASK_TERMINAL_STATUSES.has(task.status)) {
    throw new Error("task_terminal");
  }
  // A live checkout already owns the task; re-queueing would race that run.
  if (task.checkout_run_id) {
    return { dispatched: false, task };
  }
  if (!(deps.queue && deps.tenantId)) {
    throw new Error("task_dispatch_unavailable");
  }

  // Only todo/backlog are claimable, so a task parked anywhere else (in_review,
  // blocked after a failure) has to come back to an entry status or the queue
  // message would be popped and dropped. This is an explicit human "run it",
  // which is exactly the intent that justifies the flip.
  let next = task;
  if (!TASK_AGENT_CHECKOUT_ENTRY_STATUSES.has(task.status)) {
    const flipped = await deps.repo.updateTask(
      input.taskId,
      { status: "todo" },
      { actorKind: "user" }
    );
    if (flipped) {
      next = flipped;
    }
  }

  await deps.repo.recordActivity({
    task_id: input.taskId,
    event_type: "tasks.run_requested",
    payload: { from_status: task.status },
  });

  // Blocker-aware: a task with open blockers is flipped to `blocked` and NOT
  // queued, same as any other dispatch.
  await dispatchTaskIfReady(
    { queue: deps.queue, repo: deps.repo, tenantId: deps.tenantId },
    next
  );

  const refreshed = await deps.repo.getTask(input.taskId);
  return { dispatched: true, task: refreshed ?? next };
}
