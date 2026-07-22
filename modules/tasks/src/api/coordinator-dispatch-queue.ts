// Coordinator planning dispatch (agent coordination).
//
// A "Hand to Coordinator" handoff on a goal enqueues one message here; the
// consumer in apps/ai (coordinator-dispatch-consumer) runs engenty.coordinator
// headless on that goal — it audits the goal's tasks, creates & assigns
// specialist tasks for the gaps (which then auto-dispatch via the task queue),
// wires real dependencies, and posts a summary. The queue name is shared with
// apps/ai by string, mirroring AGENT_TASK_DISPATCH_QUEUE — apps/ai keeps no
// build-time dependency on @engenty/tasks.

import type { QueueServiceLike } from "@engenty/plugin-sdk";

export const AGENT_COORDINATOR_DISPATCH_QUEUE = "agent_coordinator_dispatch";

/** The stable type key of the built-in coordinator agent. */
export const ENGENTY_COORDINATOR_AGENT_TYPE_KEY = "engenty.coordinator";

export interface CoordinatorDispatchMessage {
  goal_id: string;
  tenant_id: string;
  /** Who triggered the handoff (audit/attribution). */
  triggered_by_user_id?: string | null;
}

/** Enqueue a coordinator planning run for a single goal. */
export async function enqueueCoordinatorDispatch(
  queue: QueueServiceLike,
  message: CoordinatorDispatchMessage
): Promise<void> {
  await queue.send(AGENT_COORDINATOR_DISPATCH_QUEUE, {
    goal_id: message.goal_id,
    tenant_id: message.tenant_id,
    triggered_by_user_id: message.triggered_by_user_id ?? null,
  });
}
