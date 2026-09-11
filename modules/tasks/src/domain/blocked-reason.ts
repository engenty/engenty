import type { Task } from "../schema/types.js";

/** Why a task sits at `blocked` — derived from existing row fields, not stored. */
export type BlockedReason = "approval" | "dependencies" | "question" | "failed";

/**
 * What only a caller holding more than the task row can tell.
 *
 * Neither state is a row field: an agent's question is a COMMENT (see
 * ui/lib/open-question) and a flow's gate lives in the graph run's snapshot. So
 * lists and boards, which load neither, still fall through to `failed` — while
 * the detail page, which is where both are answered, gets it right. Closing
 * that gap properly means stamping the waiting state on the task row, which is
 * a migration, not a rider on this.
 */
export interface BlockedReasonHints {
  /** The task's newest run is a flow parked at an approval gate. */
  hasOpenFlowGate?: boolean;
  /** An agent asked something and nobody has replied yet. */
  hasOpenQuestion?: boolean;
}

/**
 * Disambiguate the states conflated by `status === "blocked"`.
 * Precedence: pending approval (tool grant OR flow gate — both are "someone
 * must say yes") → open blockers (array presence) → an agent's unanswered
 * question → run failed.
 */
export function blockedReason(
  task: Pick<Task, "pending_approval_operation_ids" | "blocked_by_task_ids">,
  hints: BlockedReasonHints = {}
): BlockedReason {
  if (
    (task.pending_approval_operation_ids ?? []).length > 0 ||
    hints.hasOpenFlowGate
  ) {
    return "approval";
  }
  if ((task.blocked_by_task_ids ?? []).length > 0) {
    return "dependencies";
  }
  if (hints.hasOpenQuestion) {
    return "question";
  }
  return "failed";
}
