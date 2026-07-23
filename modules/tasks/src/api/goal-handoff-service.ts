// "Hand to Coordinator" — the goal → coordinator handoff (agent coordination).
//
// Assigns a goal to the built-in coordinator agent and materializes the
// planning work as a first-class coordination TASK assigned to
// `engenty.coordinator`, dispatched through the same `agent_task_dispatch`
// queue as every other agent task. The planning run therefore inherits the
// whole task-run substrate: durable workflow + crash resume, checkout
// conflict-safety, ai.thread/ai.agent_run + task_runs records, the "request"
// approval policy, result comments and inbox notifications. (An earlier
// design used a dedicated coordinator queue + a bare delegated conversation —
// no run record, no durability, failures died in a log line.)
//
// Repeat handoffs are idempotent: an open coordination task for the goal is
// reused (re-dispatched if it isn't running) instead of stacking siblings.

import type { QueueServiceLike } from "@engenty/plugin-sdk";
import {
  TASK_AGENT_CHECKOUT_ENTRY_STATUSES,
  TASK_TERMINAL_STATUSES,
} from "../domain/task-lifecycle.js";
import type {
  Goal,
  GoalUpdateInput,
  Task,
  TaskCreateInput,
} from "../schema/types.js";
import {
  type DispatchRepo,
  dispatchTaskIfReady,
} from "./task-dispatch-service.js";

/** The stable type key of the built-in coordinator agent. */
export const ENGENTY_COORDINATOR_AGENT_TYPE_KEY = "engenty.coordinator";

export interface GoalHandoffRepo {
  createTask(
    input: TaskCreateInput,
    opts?: { createdByUserId?: string | null; actorKind?: "user" | "agent" }
  ): Promise<Task>;
  getGoal(id: string): Promise<Goal | null>;
  listTasksPaginated(params: {
    goal_id?: string | null;
    pageSize?: number;
  }): Promise<{ data: Task[] }>;
  loadTaskStatuses(ids: string[]): Promise<Map<string, string | undefined>>;
  updateGoal(id: string, input: GoalUpdateInput): Promise<Goal | null>;
  updateTask(
    id: string,
    input: { status?: string },
    opts?: { actorKind?: "user" | "agent"; actorUserId?: string | null }
  ): Promise<Task | null>;
}

export interface GoalHandoffDeps {
  queue?: QueueServiceLike | null;
  repo: GoalHandoffRepo;
  tenantId?: string | null;
}

export interface GoalHandoffResult {
  dispatched: boolean;
  goal: Goal;
  /** The coordination task carrying the planning run (created or reused). */
  task: Task;
}

/** The coordination task's brief — what the headless coordinator run opens with. */
function buildCoordinationBrief(goal: {
  description: string | null;
  id: string;
  title: string;
}): string {
  return [
    `A human handed you the goal «${goal.title}» (goal_id: ${goal.id})${
      goal.description ? `\n\nGoal description:\n${goal.description}` : ""
    }`,
    "Run your coordinator-workflow for THIS goal only:",
    "1. Load the goal's existing tasks (tasks_list with this goal_id) and audit them.",
    "2. For each real gap, create a task (tasks_create) with goal_id set, primary_assignee_kind='agent', and primary_assignee_agent_type_key an EXACT id from registry_agents_list. Wire genuine dependencies with blocked_by_task_ids.",
    "3. Post a short summary comment on the goal's work and advance the goal status if everything is already complete.",
    "Do not touch any other goal. Act now — this is a headless run, so do not ask questions.",
  ].join("\n\n");
}

function findOpenCoordinationTask(tasks: Task[]): Task | null {
  return (
    tasks.find(
      (task) =>
        task.primary_assignee_agent_type_key ===
          ENGENTY_COORDINATOR_AGENT_TYPE_KEY &&
        !TASK_TERMINAL_STATUSES.has(task.status) &&
        task.status !== "in_review"
    ) ?? null
  );
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

  // Reuse an open coordination task instead of stacking a sibling. A claimed
  // task (active checkout) already has a planning run in flight — leave it be.
  // An unclaimed one is returned to an entry status and re-dispatched; a fresh
  // handoff on an in_review plan means the human wants a re-plan, so that
  // counts as open only once its review parked — we treat in_review as done
  // (the next handoff creates a new planning cycle).
  const { data: goalTasks } = await deps.repo.listTasksPaginated({
    goal_id: goalId,
    pageSize: 200,
  });
  let task = findOpenCoordinationTask(goalTasks);
  if (task) {
    if (task.checkout_run_id) {
      // A planning run is already executing this goal — nothing to enqueue.
      return { dispatched: false, goal: updated, task };
    }
    if (!TASK_AGENT_CHECKOUT_ENTRY_STATUSES.has(task.status)) {
      const flipped = await deps.repo.updateTask(
        task.id,
        { status: "todo" },
        { actorKind: "user", actorUserId: triggeredByUserId ?? null }
      );
      if (flipped) {
        task = flipped;
      }
    }
  } else {
    task = await deps.repo.createTask(
      {
        description: buildCoordinationBrief(updated),
        goal_id: goalId,
        primary_assignee_agent_type_key: ENGENTY_COORDINATOR_AGENT_TYPE_KEY,
        primary_assignee_kind: "agent",
        priority: "high",
        title: `Plan goal: ${updated.title}`,
      },
      { actorKind: "user", createdByUserId: triggeredByUserId ?? null }
    );
  }

  let dispatched = false;
  if (deps.queue && deps.tenantId) {
    // The repo interfaces overlap on loadTaskStatuses/updateTask — the only
    // members dispatchTaskIfReady touches for a fresh, blocker-free task.
    await dispatchTaskIfReady(
      {
        queue: deps.queue,
        repo: deps.repo as unknown as DispatchRepo,
        tenantId: deps.tenantId,
      },
      task
    );
    dispatched = true;
  }

  return { dispatched, goal: updated, task };
}
