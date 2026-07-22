// Durable tool-approval resolution for headless task runs.
//
// When a routine-materialized (or otherwise headless) task run hits a tool
// that requires approval, the run ends gracefully and the task is flipped to
// `blocked` with a needs-input inbox notification + comment. A human then
// approves the operation from the inbox, the task, or the routine, choosing a
// scope:
//   - "once":    grant added to the task's one-shot list (consumed next run).
//   - "task":    grant added to the task's persistent list.
//   - "routine": grant added to the linked trigger's list (needs trigger_id).
// Approving flips the task `blocked → todo` and re-dispatches it; the next run
// passes the pre-gate because the effective grant set now covers the op.
// Denying leaves the task blocked and records a comment.
//
// Kept behind small repo interfaces so it unit-tests with in-memory fakes.

import type { QueueServiceLike } from "@engenty/plugin-sdk";
import type { Task } from "../schema/types.js";
import {
  type DispatchRepo,
  dispatchTaskIfReady,
} from "./task-dispatch-service.js";

/** Actor attributed to approval-driven status flips + comments. */
const APPROVAL_ACTOR = "engenty.coordinator";

export type ToolApprovalScope = "once" | "task" | "routine";
export type ToolApprovalDecision = "approve" | "deny";

export interface ApprovalTasksRepo {
  addComment(
    taskId: string,
    content: string,
    opts?: { createdByAgentTypeKey?: string; createdByUserId?: string | null }
  ): Promise<unknown>;
  addTaskApprovalGrant(
    id: string,
    operationId: string,
    opts: { once: boolean }
  ): Promise<Task | null>;
  getTask(id: string): Promise<Task | null>;
  loadTaskStatuses(ids: string[]): Promise<Map<string, string | undefined>>;
  recordActivity(input: {
    task_id: string;
    event_type: string;
    payload?: Record<string, unknown>;
    actor_agent_type_key?: string | null;
    actor_user_id?: string | null;
  }): Promise<void>;
  updateTask(
    id: string,
    input: { status?: string },
    opts?: { actorKind?: "user" | "agent"; actorUserId?: string | null }
  ): Promise<Task | null>;
}

export interface ApprovalTriggersRepo {
  addTriggerApprovalGrant(id: string, operationId: string): Promise<unknown>;
}

export interface ResolveToolApprovalDeps {
  actorUserId?: string | null;
  queue?: QueueServiceLike | null;
  tasksRepo: ApprovalTasksRepo;
  tenantId?: string | null;
  triggersRepo?: ApprovalTriggersRepo | null;
}

export interface ResolveToolApprovalInput {
  decision: ToolApprovalDecision;
  operationId: string;
  scope?: ToolApprovalScope;
  taskId: string;
}

/**
 * Apply an approve/deny decision for a task's pending tool approval. Returns the
 * refreshed task. Throws `task_not_found`, `task_has_no_trigger`,
 * `approval_scope_required`, or `triggers_repo_unavailable`.
 */
export async function resolveTaskToolApproval(
  deps: ResolveToolApprovalDeps,
  input: ResolveToolApprovalInput
): Promise<Task> {
  const { tasksRepo } = deps;
  const task = await tasksRepo.getTask(input.taskId);
  if (!task) {
    throw new Error("task_not_found");
  }

  if (input.decision === "deny") {
    await tasksRepo.addComment(
      input.taskId,
      `⛔ Denied \`${input.operationId}\` — the task stays blocked until approved.`,
      { createdByAgentTypeKey: APPROVAL_ACTOR }
    );
    await tasksRepo.recordActivity({
      task_id: input.taskId,
      event_type: "tasks.tool_approval_resolved",
      payload: { decision: "deny", operation_id: input.operationId },
      actor_user_id: deps.actorUserId ?? null,
    });
    return task;
  }

  const scope = input.scope;
  if (!scope) {
    throw new Error("approval_scope_required");
  }

  if (scope === "routine") {
    if (!task.trigger_id) {
      throw new Error("task_has_no_trigger");
    }
    if (!deps.triggersRepo) {
      throw new Error("triggers_repo_unavailable");
    }
    await deps.triggersRepo.addTriggerApprovalGrant(
      task.trigger_id,
      input.operationId
    );
  } else {
    await tasksRepo.addTaskApprovalGrant(input.taskId, input.operationId, {
      once: scope === "once",
    });
  }

  await tasksRepo.addComment(
    input.taskId,
    `✅ Approved \`${input.operationId}\` (${scopeLabel(scope)}). Re-running the task.`,
    { createdByAgentTypeKey: APPROVAL_ACTOR }
  );
  await tasksRepo.recordActivity({
    task_id: input.taskId,
    event_type: "tasks.tool_approval_resolved",
    payload: { decision: "approve", operation_id: input.operationId, scope },
    actor_user_id: deps.actorUserId ?? null,
  });

  // Flip blocked → todo and re-dispatch so the next run passes the gate.
  let next = task;
  if (task.status === "blocked") {
    const flipped = await tasksRepo.updateTask(
      input.taskId,
      { status: "todo" },
      { actorKind: "user", actorUserId: deps.actorUserId ?? null }
    );
    if (flipped) {
      next = flipped;
    }
  }
  if (deps.queue && deps.tenantId) {
    // dispatchTaskIfReady only reads loadTaskStatuses/updateTask here (no
    // child/dependent walk), both present on ApprovalTasksRepo.
    await dispatchTaskIfReady(
      {
        queue: deps.queue,
        repo: tasksRepo as unknown as DispatchRepo,
        tenantId: deps.tenantId,
      },
      next
    );
  }
  return next;
}

function scopeLabel(scope: ToolApprovalScope): string {
  switch (scope) {
    case "once":
      return "once";
    case "task":
      return "this task";
    case "routine":
      return "this routine";
  }
}
