// Blocker-aware task dispatch (agent coordination, Phase 1).
//
// Wraps the raw `enqueueTaskDispatch` with the dependency graph:
//  - `dispatchTaskIfReady` gates the enqueue on open blockers; a dispatchable
//    task that still has open blockers is flipped to 'blocked' and NOT queued.
//  - `wakeBlockedDependents` runs after a task reaches 'done': it re-checks each
//    dependent, unblocks (blocked→todo) + dispatches the ones whose last open
//    blocker was this task, and comments on a parent whose children are all
//    terminal.
//
// Kept behind a small `DispatchRepo` interface so it unit-tests with an
// in-memory fake — no Supabase.

import type { QueueServiceLike } from "@engenty/plugin-sdk";
import {
  allChildrenTerminal,
  openBlockerIds,
} from "../domain/task-blockers.js";
import type { Task, TaskUpdateInput } from "../schema/types.js";
import {
  enqueueTaskDispatch,
  isDispatchableTask,
} from "./task-dispatch-queue.js";

/** Agent principal attributed to coordination-driven status flips. */
const COORDINATION_ACTOR = "engenty.coordinator";

export interface DispatchRepo {
  addComment(
    taskId: string,
    content: string,
    opts?: { createdByAgentTypeKey?: string }
  ): Promise<unknown>;
  listChildren(parentId: string): Promise<Task[]>;
  listDependents(taskId: string): Promise<Task[]>;
  loadTaskStatuses(ids: string[]): Promise<Map<string, string | undefined>>;
  recordActivity(input: {
    task_id: string;
    event_type: string;
    payload?: Record<string, unknown>;
    actor_agent_type_key?: string | null;
  }): Promise<void>;
  updateTask(
    id: string,
    input: TaskUpdateInput,
    opts?: { actorKind?: "user" | "agent" }
  ): Promise<Task | null>;
}

export interface DispatchDeps {
  queue: QueueServiceLike;
  repo: DispatchRepo;
  tenantId: string;
}

/** Flip a task to 'blocked' best-effort (a tenant may have removed the status). */
async function markBlocked(deps: DispatchDeps, task: Task): Promise<void> {
  if (task.status === "blocked") {
    return;
  }
  try {
    await deps.repo.updateTask(
      task.id,
      { status: "blocked" },
      { actorKind: "agent" }
    );
  } catch {
    // Non-fatal: worst case the task stays in its entry status but is never
    // dispatched (the blocker gate below still holds). Truth-in-UI is a nicety.
  }
}

/**
 * Enqueue a task for agent dispatch, gated by its blocker graph. A dispatchable
 * task with open blockers is flipped to 'blocked' and NOT queued. Use this at
 * every create/update dispatch site in place of a bare `enqueueTaskDispatch`.
 */
export async function dispatchTaskIfReady(
  deps: DispatchDeps,
  task: Task
): Promise<void> {
  if (!isDispatchableTask(task)) {
    return;
  }
  const statusById = await deps.repo.loadTaskStatuses(task.blocked_by_task_ids);
  const open = openBlockerIds(task.blocked_by_task_ids, statusById);
  if (open.length > 0) {
    await markBlocked(deps, task);
    return;
  }
  await enqueueTaskDispatch(deps.queue, task, deps.tenantId);
}

/**
 * Called after a task transitions to 'done'. Wakes each dependent whose last
 * open blocker was this task (blocked→todo, then dispatch), and comments on a
 * parent once all its children are terminal.
 */
export async function wakeBlockedDependents(
  deps: DispatchDeps,
  doneTask: Task
): Promise<void> {
  // 1) Dependents that listed this task as a blocker.
  const dependents = await deps.repo.listDependents(doneTask.id);
  for (const dep of dependents) {
    const statusById = await deps.repo.loadTaskStatuses(
      dep.blocked_by_task_ids
    );
    if (openBlockerIds(dep.blocked_by_task_ids, statusById).length > 0) {
      continue; // still blocked by another task
    }
    let next: Task = dep;
    if (dep.status === "blocked") {
      const flipped = await deps.repo.updateTask(
        dep.id,
        { status: "todo" },
        { actorKind: "agent" }
      );
      if (flipped) {
        next = flipped;
      }
    }
    await deps.repo.recordActivity({
      task_id: dep.id,
      event_type: "tasks.blockers_resolved",
      payload: { resolved_by: doneTask.id },
      actor_agent_type_key: COORDINATION_ACTOR,
    });
    if (isDispatchableTask(next)) {
      await enqueueTaskDispatch(deps.queue, next, deps.tenantId);
    }
  }

  // 2) Parent wake when every child is terminal. Comment + activity only — we
  // do NOT auto-dispatch the parent (it may be a container the coordinator
  // reviews rather than an agent that should re-run).
  if (doneTask.parent_id) {
    const children = await deps.repo.listChildren(doneTask.parent_id);
    if (allChildrenTerminal(children.map((c) => c.status))) {
      await deps.repo.addComment(
        doneTask.parent_id,
        "All subtasks are complete.",
        { createdByAgentTypeKey: COORDINATION_ACTOR }
      );
      await deps.repo.recordActivity({
        task_id: doneTask.parent_id,
        event_type: "tasks.children_completed",
        actor_agent_type_key: COORDINATION_ACTOR,
      });
    }
  }
}
