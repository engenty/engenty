import type { Task } from "../schema/types.js";

/** Why a task sits at `blocked` — derived from existing row fields, not stored. */
export type BlockedReason = "approval" | "dependencies" | "failed";

/**
 * Disambiguate the three states conflated by `status === "blocked"`.
 * Precedence: pending approval → open blockers (array presence) → run failed.
 * List/kanban callers without blocker statuses use array presence; callers with
 * statuses loaded may prefer `openBlockerIds` for precision.
 */
export function blockedReason(
  task: Pick<Task, "pending_approval_operation_ids" | "blocked_by_task_ids">
): BlockedReason {
  if ((task.pending_approval_operation_ids ?? []).length > 0) {
    return "approval";
  }
  if ((task.blocked_by_task_ids ?? []).length > 0) {
    return "dependencies";
  }
  return "failed";
}
