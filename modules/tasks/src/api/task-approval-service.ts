// Durable tool-approval resolution for runs whose subject is a task.
//
// When such a run hits a tool that requires approval, the run ends gracefully
// and the task is flipped to `blocked` with a needs-input inbox notification +
// comment. A human then approves the operation from the inbox or the task,
// choosing a scope:
//   - "once": one-shot core grant on the task (reaped after the next run).
//   - "task": standing core grant on the task.
// The task is the only subject on offer here — a grant that should outlive one
// task belongs on the routine, and is granted and resolved there.
// Approving flips the task `blocked → todo` and re-dispatches it; the next run
// passes the pre-gate because the effective grant set now covers the op.
// Denying leaves the task blocked and records a comment.
//
// Kept behind small repo interfaces so it unit-tests with in-memory fakes.

import type { PluginAuthContext, QueueServiceLike } from "@engenty/plugin-sdk";
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
const APPROVAL_ACTOR = "system.tasks";

export type ToolApprovalScope = "once" | "task";
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

/**
 * The core approval store (core.approval_grants) — since the task-row grant
 * columns were dropped, the ONLY store a tool approval lands in. Approving
 * writes here; dispatch READS the run's grant set from here (2d); core-side
 * gates (connections profile policy, escalation) consume here via the run's
 * forwarded task id. Optional: absent in unit fakes and in the
 * connections-resume path, where decide already minted the core grant.
 */
export interface CoreGrantsWriter {
  grant(input: {
    grantedBy?: string | null;
    operationId: string;
    scope: "once" | "task";
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
  validateAgentAssignment?: (task: Task) => Promise<void>;
}

/**
 * A tool approval is the HUMAN side of the HITL gate: only a user principal may
 * decide one. Without this, any agent with tasks-module access could lift its
 * own approval gate — on 2026-08-22 a coordinator run approved a parked
 * `kb_source_delete` on a task it was unblocking, defeating the gate entirely.
 * Endpoint-level on purpose: server-side system callers of
 * `resolveTaskToolApproval` (e.g. the connections-resume subscriber, which acts
 * on a decision the user already made elsewhere) stay functional.
 */
export function assertHumanApprovalActor(
  auth?: Pick<PluginAuthContext, "agentId" | "principalType">
): void {
  const isUser = (auth?.principalType ?? "user") === "user";
  if (!isUser || auth?.agentId) {
    throw new Error("tool_approval_requires_user");
  }
}

export interface ResolveToolApprovalInput {
  decision: ToolApprovalDecision;
  /** Single-op form (back-compat). Exactly one of the two must be set. */
  operationId?: string;
  /** Batch form: resolve several pending ops in one decision (cap 64). */
  operationIds?: string[];
  scope?: ToolApprovalScope;
  taskId: string;
}

/** Normalize the single/batch input forms into one non-empty, deduped list. */
function normalizeOperationIds(input: ResolveToolApprovalInput): string[] {
  const ids =
    input.operationIds ?? (input.operationId ? [input.operationId] : []);
  const deduped = [...new Set(ids.filter((id) => id.length > 0))];
  if (deduped.length === 0) {
    throw new Error("operation_id_required");
  }
  return deduped;
}

/**
 * Apply an approve/deny decision for one or more of a task's pending tool
 * approvals. Returns the refreshed task. Throws `task_not_found`,
 * `operation_id_required`, or `approval_scope_required`.
 *
 * A parked run may be waiting on SEVERAL gated ops at once (all recorded in
 * `pending_approval_operation_ids`). Re-dispatching after the FIRST approval
 * wastes a run: the resumed run re-parks on the next still-ungranted op — and
 * its checkout wipes the pending list, destroying the other open asks. So the
 * dispatch is state-driven: grants are recorded per decision, but the task only
 * re-dispatches once the pending set is EMPTY. While ops remain pending the
 * task stays parked (status untouched, like a deny leaves it), so nothing else
 * auto-dispatches it.
 */
export async function resolveTaskToolApproval(
  deps: ResolveToolApprovalDeps,
  input: ResolveToolApprovalInput
): Promise<Task> {
  const { tasksRepo } = deps;
  const operationIds = normalizeOperationIds(input);
  const task = await tasksRepo.getTask(input.taskId);
  if (!task) {
    throw new Error("task_not_found");
  }

  if (input.decision === "deny") {
    // Denials leave the pending entries in place (the human can still approve
    // later), so the pending set never empties through this branch and the
    // "dispatch only when empty" rule holds trivially: a deny never dispatches.
    await tasksRepo.addComment(
      input.taskId,
      `⛔ Denied ${formatOps(operationIds)} — the task stays blocked until approved.`,
      { createdByAgentTypeKey: APPROVAL_ACTOR }
    );
    for (const operationId of operationIds) {
      await tasksRepo.recordActivity({
        task_id: input.taskId,
        event_type: "tasks.tool_approval_resolved",
        payload: { decision: "deny", operation_id: operationId },
        actor_user_id: deps.actorUserId ?? null,
      });
    }
    return task;
  }

  const scope = input.scope;
  if (!scope) {
    throw new Error("approval_scope_required");
  }

  for (const operationId of operationIds) {
    await deps.coreGrants?.grant({
      grantedBy: deps.actorUserId ?? null,
      operationId,
      scope,
      subjectId: input.taskId,
    });

    // The ask has been answered, so the task no longer advertises it. Denials
    // deliberately skip this: the request stays open so the human can still
    // approve later from the task itself.
    await tasksRepo.clearTaskPendingApproval?.(input.taskId, operationId);
  }

  // State-driven resume: re-read what the task is STILL waiting on. Any
  // remaining pending op means the run would just park again (and its checkout
  // would wipe the other open asks), so hold the dispatch until the set is
  // empty. The grant is recorded either way — it applies to the next run.
  const afterClear = (await tasksRepo.getTask(input.taskId)) ?? task;
  const remaining = afterClear.pending_approval_operation_ids ?? [];
  if (remaining.length > 0) {
    await tasksRepo.addComment(
      input.taskId,
      `✅ Approved ${formatOps(operationIds)} (${scopeLabel(scope)}). Waiting on ${remaining.length} more pending approval${remaining.length === 1 ? "" : "s"} before re-running.`,
      { createdByAgentTypeKey: APPROVAL_ACTOR }
    );
    for (const operationId of operationIds) {
      await tasksRepo.recordActivity({
        task_id: input.taskId,
        event_type: "tasks.tool_approval_resolved",
        payload: {
          decision: "approve",
          operation_id: operationId,
          redispatched: false,
          remaining_pending: remaining.length,
          scope,
        },
        actor_user_id: deps.actorUserId ?? null,
      });
    }
    return afterClear;
  }

  // Return the task to an entry status so the re-dispatch can actually claim it.
  // The needs-approval path parks the task at `blocked`, but a human may have
  // moved it since, and only todo/backlog are agent-runnable — so flip from any
  // non-entry, non-terminal status, not just from `blocked`. A live checkout is
  // left alone: that run still owns the task and will finalize it itself.
  let next = afterClear;
  const claimed = Boolean(afterClear.checkout_run_id);
  const terminal = TASK_TERMINAL_STATUSES.has(afterClear.status);
  if (
    !(
      claimed ||
      terminal ||
      TASK_AGENT_CHECKOUT_ENTRY_STATUSES.has(afterClear.status)
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
    `✅ Approved ${formatOps(operationIds)} (${scopeLabel(scope)}). ${
      willDispatch
        ? "Re-running the task."
        : "The grant applies to the task's next run."
    }`,
    { createdByAgentTypeKey: APPROVAL_ACTOR }
  );
  for (const operationId of operationIds) {
    await tasksRepo.recordActivity({
      task_id: input.taskId,
      event_type: "tasks.tool_approval_resolved",
      payload: {
        decision: "approve",
        operation_id: operationId,
        redispatched: willDispatch,
        scope,
      },
      actor_user_id: deps.actorUserId ?? null,
    });
  }

  if (deps.queue && deps.tenantId) {
    // dispatchTaskIfReady only reads loadTaskStatuses/updateTask here (no
    // child/dependent walk), both present on ApprovalTasksRepo.
    await dispatchTaskIfReady(
      {
        queue: deps.queue,
        repo: tasksRepo as unknown as DispatchRepo,
        tenantId: deps.tenantId,
        validateAgentAssignment: deps.validateAgentAssignment,
      },
      next,
      // A person clicked approve — the run detail's "started by" should say
      // so rather than "unknown".
      "button"
    );
  }
  // Re-read so the caller sees the cleared pending list and any status the
  // dispatch itself set, rather than the snapshot taken before those writes.
  return (await tasksRepo.getTask(input.taskId)) ?? next;
}

/** `\`a\`` or `\`a\`, \`b\`` — comment-friendly list of operation ids. */
function formatOps(operationIds: string[]): string {
  return operationIds.map((id) => `\`${id}\``).join(", ");
}

function scopeLabel(scope: ToolApprovalScope): string {
  switch (scope) {
    case "once":
      return "once";
    case "task":
      return "this task";
  }
}
