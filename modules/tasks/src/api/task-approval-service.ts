// Durable tool-approval resolution for headless task runs.
//
// When a routine-materialized (or otherwise headless) task run hits a tool
// that requires approval, the run ends gracefully and the task is flipped to
// `blocked` with a needs-input inbox notification + comment. A human then
// approves the operation from the inbox, the task, or the routine, choosing a
// scope:
//   - "once":    one-shot core grant on the task (reaped after the next run).
//   - "task":    standing core grant on the task.
//   - "routine": grant added to the linked trigger's config list (needs
//                trigger_id) + a core grant on the trigger subject.
// Approving flips the task `blocked → todo` and re-dispatches it; the next run
// passes the pre-gate because the effective grant set now covers the op.
// Denying leaves the task blocked and records a comment.
//
// Kept behind small repo interfaces so it unit-tests with in-memory fakes.

import type { QueueServiceLike } from "@engenty/plugin-sdk";
import {
  TASK_AGENT_CHECKOUT_ENTRY_STATUSES,
  TASK_TERMINAL_STATUSES,
} from "../domain/task-lifecycle.js";
import type { Task } from "../schema/types.js";
import { isDispatchableTask } from "./task-dispatch-queue.js";
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
  clearTaskPendingApproval?(id: string, operationId: string): Promise<void>;
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

/**
 * The core approval store (core.approval_grants) — since the task-row grant
 * columns were dropped, the ONLY store a tool approval lands in. Approving
 * writes here; dispatch READS the run's grant set from here (2d); core-side
 * gates (connections profile policy, escalation) consume here via the run's
 * forwarded task/trigger id. Optional: absent in unit fakes and in the
 * connections-resume path, where decide already minted the core grant.
 */
export interface CoreGrantsWriter {
  grant(input: {
    grantedBy?: string | null;
    operationId: string;
    scope: "once" | "task" | "trigger";
    subjectId: string;
  }): Promise<void>;
  /** One subject's unexpired grants, split one-shot vs standing — the read
   * behind the task detail's "Approved tools" section. */
  listBySubject(input: {
    subjectId: string;
  }): Promise<{ once: string[]; standing: string[] }>;
  /** Unexpired operation ids granted to any of these subjects, deduped. */
  listOperationIds(input: { subjectIds: string[] }): Promise<string[]>;
  /** Revoke one operation's grants on a subject (scope-blind) — the human
   * "remove approved tool" affordance. */
  revoke(input: { operationId: string; subjectId: string }): Promise<void>;
  /** Reap a subject's one-shot grants — called after the run they unlocked. */
  revokeOnce(input: { subjectId: string }): Promise<void>;
}

export interface ResolveToolApprovalDeps {
  actorUserId?: string | null;
  coreGrants?: CoreGrantsWriter | null;
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
    await deps.coreGrants?.grant({
      grantedBy: deps.actorUserId ?? null,
      operationId: input.operationId,
      scope: "trigger",
      subjectId: task.trigger_id,
    });
  } else {
    await deps.coreGrants?.grant({
      grantedBy: deps.actorUserId ?? null,
      operationId: input.operationId,
      scope: scope === "once" ? "once" : "task",
      subjectId: input.taskId,
    });
  }

  // The ask has been answered, so the task no longer advertises it. Denials
  // deliberately skip this: the request stays open so the human can still
  // approve later from the task itself.
  await tasksRepo.clearTaskPendingApproval?.(input.taskId, input.operationId);

  // Return the task to an entry status so the re-dispatch can actually claim it.
  // The needs-approval path parks the task at `blocked`, but a human may have
  // moved it since, and only todo/backlog are agent-runnable — so flip from any
  // non-entry, non-terminal status, not just from `blocked`. A live checkout is
  // left alone: that run still owns the task and will finalize it itself.
  let next = task;
  const claimed = Boolean(task.checkout_run_id);
  const terminal = TASK_TERMINAL_STATUSES.has(task.status);
  if (
    !(
      claimed ||
      terminal ||
      TASK_AGENT_CHECKOUT_ENTRY_STATUSES.has(task.status)
    )
  ) {
    const flipped = await tasksRepo.updateTask(
      input.taskId,
      { status: "todo" },
      { actorKind: "user", actorUserId: deps.actorUserId ?? null }
    );
    if (flipped) {
      next = flipped;
    }
  }

  // Only promise a re-run when one is actually going to be queued — a grant on a
  // terminal, claimed or un-dispatchable task is still recorded (it applies to
  // the next run), but the comment must not claim the task is running again.
  const willDispatch = Boolean(
    deps.queue && deps.tenantId && isDispatchableTask(next)
  );
  await tasksRepo.addComment(
    input.taskId,
    `✅ Approved \`${input.operationId}\` (${scopeLabel(scope)}). ${
      willDispatch
        ? "Re-running the task."
        : "The grant applies to the task's next run."
    }`,
    { createdByAgentTypeKey: APPROVAL_ACTOR }
  );
  await tasksRepo.recordActivity({
    task_id: input.taskId,
    event_type: "tasks.tool_approval_resolved",
    payload: {
      decision: "approve",
      operation_id: input.operationId,
      redispatched: willDispatch,
      scope,
    },
    actor_user_id: deps.actorUserId ?? null,
  });

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
  // Re-read so the caller sees the cleared pending list and any status the
  // dispatch itself set, rather than the snapshot taken before those writes.
  return (await tasksRepo.getTask(input.taskId)) ?? next;
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
