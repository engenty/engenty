// "Hand to Coordinator" — the goal → coordinator handoff (agent coordination).
//
// Assigns a goal to the built-in coordinator agent and kicks off a planning
// run: it sets the goal's owner to engenty.coordinator, activates it (planned →
// active), and enqueues a coordinator dispatch. The coordinator then audits the
// goal, creates & assigns specialist tasks, and those auto-dispatch via the
// existing task queue. Shared by the gateway op and the REST route.

import type { QueueServiceLike } from "@engenty/plugin-sdk";
import type { Goal, GoalUpdateInput } from "../schema/types.js";
import {
  ENGENTY_COORDINATOR_AGENT_TYPE_KEY,
  enqueueCoordinatorDispatch,
} from "./coordinator-dispatch-queue.js";

export interface GoalHandoffRepo {
  getGoal(id: string): Promise<Goal | null>;
  updateGoal(id: string, input: GoalUpdateInput): Promise<Goal | null>;
}

export interface GoalHandoffDeps {
  queue?: QueueServiceLike | null;
  repo: GoalHandoffRepo;
  tenantId?: string | null;
}

export interface GoalHandoffResult {
  dispatched: boolean;
  goal: Goal;
}

/**
 * Hand a goal to the coordinator. Throws `goal_not_found` when the goal is
 * missing and `goal_terminal` when it is already achieved/cancelled (nothing
 * left to plan). Activation is a no-op when the goal is already active.
 */
export async function handoffGoalToCoordinator(
  deps: GoalHandoffDeps,
  goalId: string,
  triggeredByUserId?: string | null
): Promise<GoalHandoffResult> {
  const existing = await deps.repo.getGoal(goalId);
  if (!existing) {
    throw new Error("goal_not_found");
  }
  if (existing.status === "achieved" || existing.status === "cancelled") {
    throw new Error("goal_terminal");
  }

  const patch: GoalUpdateInput = {
    owner_agent_type_key: ENGENTY_COORDINATOR_AGENT_TYPE_KEY,
    // A goal a human hands over should be worked on; activate a planned goal.
    ...(existing.status === "planned" ? { status: "active" as const } : {}),
  };
  const updated = await deps.repo.updateGoal(goalId, patch);
  if (!updated) {
    throw new Error("goal_not_found");
  }

  let dispatched = false;
  if (deps.queue && deps.tenantId) {
    await enqueueCoordinatorDispatch(deps.queue, {
      goal_id: goalId,
      tenant_id: deps.tenantId,
      triggered_by_user_id: triggeredByUserId ?? null,
    });
    dispatched = true;
  }

  return { dispatched, goal: updated };
}
