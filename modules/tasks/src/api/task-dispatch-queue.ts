import type { QueueServiceLike } from "@engenty/plugin-sdk";
import type { Task } from "../schema/types.js";

export const AGENT_TASK_DISPATCH_QUEUE = "agent_task_dispatch";

// Statuses from which an agent checkout is NOT allowed (task already claimed
// or terminal). Any other status is considered a checkout-entry status.
const NON_CHECKOUT_ENTRY_STATUSES = new Set([
  "in_progress",
  "in_review",
  "done",
  "cancelled",
  "blocked",
]);

export function isDispatchableTask(task: Task): boolean {
  return (
    task.primary_assignee_kind === "agent" &&
    task.checkout_run_id === null &&
    !NON_CHECKOUT_ENTRY_STATUSES.has(task.status)
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
