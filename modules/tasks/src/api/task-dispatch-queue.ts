import type { QueueServiceLike } from "@engenty/plugin-sdk";
import { TASK_AGENT_CHECKOUT_ENTRY_STATUSES } from "../domain/task-lifecycle.js";
import type { Task } from "../schema/types.js";

export const AGENT_TASK_DISPATCH_QUEUE = "agent_task_dispatch";

/**
 * A task is dispatchable exactly when an agent could check it out: assigned to
 * an agent, unclaimed, and parked in an entry status. The status set is the SAME
 * one `checkoutTask` enforces (TASK_AGENT_CHECKOUT_ENTRY_STATUSES) — an earlier
 * split definition here admitted `request` and tenant-defined custom statuses,
 * which then 409'd at checkout and vanished as a silent `skipped` run.
 *
 * Statuses outside the entry set are deliberately not agent-runnable: assigning
 * and planning is a human/coordinator act, so work reaches an agent by landing
 * in todo/backlog, not by sitting in an arbitrary column.
 */
export function isDispatchableTask(task: Task): boolean {
  return (
    task.primary_assignee_kind === "agent" &&
    task.checkout_run_id === null &&
    TASK_AGENT_CHECKOUT_ENTRY_STATUSES.has(task.status)
  );
}

export async function enqueueTaskDispatch(
  queue: QueueServiceLike,
  task: { id: string; primary_assignee_agent_type_key: string | null },
  tenantId: string
): Promise<void> {
  if (!task.primary_assignee_agent_type_key) {
    return;
  }
  await queue.send(AGENT_TASK_DISPATCH_QUEUE, {
    agent_type_key: task.primary_assignee_agent_type_key,
    task_id: task.id,
    tenant_id: tenantId,
  });
}
