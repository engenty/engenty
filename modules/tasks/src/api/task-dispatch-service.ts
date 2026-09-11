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
const COORDINATION_ACTOR = "system.tasks";

/** Agent result comments are recorded as `🤖 <agent_type_key>: …`. */
export const AGENT_RESULT_COMMENT_PREFIX = "🤖";

/** Cap for blocker-result comments copied onto dependents (briefs stay readable). */
export const BLOCKER_RESULT_COMMENT_MAX = 1500;

export function truncateBlockerResultComment(
  text: string,
  max = BLOCKER_RESULT_COMMENT_MAX
): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export interface DispatchRepo {
  addComment(
    taskId: string,
    content: string,
    opts?: { createdByAgentTypeKey?: string }
  ): Promise<unknown>;
  /** Newest comment whose content starts with the agent-result prefix (`🤖`). */
  getLatestAgentResultComment(taskId: string): Promise<string | null>;
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
  validateAgentAssignment?: (task: Task) => Promise<void>;
}

/** Flip a task to 'blocked'. Status rails are non-deletable — failures are real faults. */
async function markBlocked(repo: DispatchRepo, task: Task): Promise<void> {
  if (task.status === "blocked") {
    return;
  }
  try {
    await repo.updateTask(
      task.id,
      { status: "blocked" },
      { actorKind: "agent" }
    );
  } catch (err) {
    // Surface it: the task would otherwise look runnable while never dispatching.
    await repo
      .recordActivity({
        task_id: task.id,
        event_type: "tasks.block_failed",
        payload: { error: err instanceof Error ? err.message : String(err) },
        actor_agent_type_key: COORDINATION_ACTOR,
      })
      .catch(() => {});
    throw err;
  }
}

/** What the blocker gate decided, plus `queued` once the enqueue happened. */
export type DispatchGate = "blocked" | "not_dispatchable" | "ready";
export type DispatchOutcome = DispatchGate | "queued";

/**
 * The gate on its own: may this task run right now? A dispatchable task with
 * open blockers is flipped to 'blocked' and answers `blocked`.
 *
 * Separate from the enqueue because not every dispatch rides the queue — a
 * manual "run now" runs the job in the caller's own process so the click gets a
 * run id back (Phase 7 #3). Deferring the dispatch must not smuggle a blocked
 * task past the gate, so that path asks here first.
 */
export async function taskDispatchGate(
  repo: DispatchRepo,
  task: Task
): Promise<DispatchGate> {
  if (!isDispatchableTask(task)) {
    return "not_dispatchable";
  }
  const statusById = await repo.loadTaskStatuses(task.blocked_by_task_ids);
  if (openBlockerIds(task.blocked_by_task_ids, statusById).length > 0) {
    await markBlocked(repo, task);
    return "blocked";
  }
  return "ready";
}

/**
 * Enqueue a task for agent dispatch, gated by its blocker graph. Use this at
 * every create/update dispatch site in place of a bare `enqueueTaskDispatch`.
 */
export async function dispatchTaskIfReady(
  deps: DispatchDeps,
  task: Task,
  /** Passed on to the run record when the caller knows why it dispatched. */
  startedBy?: "cron" | "button" | "hook" | "direct"
): Promise<DispatchOutcome> {
  if (task.primary_assignee_kind === "agent") {
    await deps.validateAgentAssignment?.(task);
  }
  const gate = await taskDispatchGate(deps.repo, task);
  if (gate !== "ready") {
    return gate;
  }
  await enqueueTaskDispatch(deps.queue, task, deps.tenantId, startedBy);
  return "queued";
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
  const blockerRef = doneTask.identifier ?? doneTask.id;
  const resultComment = await deps.repo.getLatestAgentResultComment(
    doneTask.id
  );
  const blockerSummary = truncateBlockerResultComment(
    resultComment ?? doneTask.title
  );
  for (const dep of dependents) {
    // One comment per resolved blocker (even when other blockers remain) so
    // the dependent's brief accumulates each result before it finally wakes.
    await deps.repo.addComment(
      dep.id,
      `Blocker ${blockerRef} completed: ${blockerSummary}`,
      { createdByAgentTypeKey: COORDINATION_ACTOR }
    );

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
    // Comment is already on the dependent — enqueue after so the woken brief
    // includes the blocker result.
    if (isDispatchableTask(next)) {
      await deps.validateAgentAssignment?.(next);
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
