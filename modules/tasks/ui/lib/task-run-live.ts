import type { Task, TaskRun } from "../../src/schema/types.js";
import type { TaskAgentRunStatus } from "./task-run-observer-api.js";
import { isTaskRunObserverPollingStatus } from "./task-run-observer-api.js";

/** Poll interval while task agent work may still be in flight. */
export const TASK_LIVE_POLL_MS = 3000;

/**
 * Whether a run card should show as in progress.
 * Checkout alone does not keep a finished run "active".
 */
export function isTaskRunLiveActive(run: TaskRun): boolean {
  return !run.run_finished_at;
}

export function resolveCheckoutLinkedRun(
  runs: readonly TaskRun[],
  checkoutRunId: string | null | undefined
): TaskRun | null {
  if (!checkoutRunId) {
    return null;
  }
  return runs.find((run) => run.agent_session_run_id === checkoutRunId) ?? null;
}

export function shouldPollTaskDetailLive(input: {
  observerStreaming: boolean;
  runs: readonly TaskRun[] | undefined;
  task: Pick<Task, "checkout_run_id"> | null | undefined;
}): boolean {
  if (input.observerStreaming) {
    return true;
  }
  const runs = input.runs ?? [];
  if (runs.some((run) => isTaskRunLiveActive(run))) {
    return true;
  }
  const checkoutRunId = input.task?.checkout_run_id;
  if (!checkoutRunId) {
    return false;
  }
  const linked = resolveCheckoutLinkedRun(runs, checkoutRunId);
  return linked ? isTaskRunLiveActive(linked) : true;
}

export function canContinueTaskFromUserComment(input: {
  runs: readonly TaskRun[];
  task: Pick<
    Task,
    "checkout_run_id" | "primary_assignee_kind" | "status"
  > | null;
}): boolean {
  const { task } = input;
  if (!task?.checkout_run_id) {
    return false;
  }
  if (task.primary_assignee_kind !== "agent" && task.status !== "in_progress") {
    return false;
  }
  return true;
}

export function isWaitingRunStatus(status: TaskAgentRunStatus): boolean {
  return status === "waiting_for_input" || status === "waiting_for_approval";
}

export function shouldStartContinuationRun(
  status: TaskAgentRunStatus | null | undefined
): boolean {
  if (!status) {
    return true;
  }
  if (isWaitingRunStatus(status)) {
    return false;
  }
  return !isTaskRunObserverPollingStatus(status);
}
