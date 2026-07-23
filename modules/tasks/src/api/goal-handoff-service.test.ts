import { describe, expect, it } from "vitest";
import type {
  Goal,
  GoalUpdateInput,
  Task,
  TaskCreateInput,
} from "../schema/types.js";
import {
  ENGENTY_COORDINATOR_AGENT_TYPE_KEY,
  type GoalHandoffRepo,
  handoffGoalToCoordinator,
} from "./goal-handoff-service.js";
import { AGENT_TASK_DISPATCH_QUEUE } from "./task-dispatch-queue.js";

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    created_at: "2026-07-22T00:00:00.000Z",
    description: null,
    id: "goal-1",
    level: "task",
    owner_agent_id: null,
    owner_agent_type_key: null,
    owner_user_id: null,
    parent_id: null,
    project_id: null,
    scope_id: "scope",
    status: "planned",
    target_date: null,
    tenant_id: "tenant",
    title: "Test goal",
    updated_at: "2026-07-22T00:00:00.000Z",
    ...overrides,
  };
}

let taskSeq = 0;
function makeTask(overrides: Partial<Task> = {}): Task {
  taskSeq += 1;
  return {
    approval_grants: [],
    approval_grants_once: [],
    blocked_by_task_ids: [],
    cancelled_at: null,
    checkout_run_id: null,
    completed_at: null,
    created_at: "2026-07-22T00:00:00.000Z",
    created_by_agent_type_key: null,
    created_by_user_id: null,
    description: null,
    due_date: null,
    goal_id: "goal-1",
    id: `task-${taskSeq}`,
    identifier: `ENG-${taskSeq}`,
    parent_id: null,
    primary_assignee_agent_type_key: ENGENTY_COORDINATOR_AGENT_TYPE_KEY,
    primary_assignee_kind: "agent",
    primary_assignee_user_id: null,
    priority: "high",
    project_id: null,
    request_depth: 0,
    scope_id: "scope",
    started_at: null,
    status: "todo",
    tenant_id: "tenant",
    title: "Plan goal: Test goal",
    trigger_id: null,
    updated_at: "2026-07-22T00:00:00.000Z",
    ...overrides,
  } as Task;
}

function makeRepo(
  goal: Goal | null,
  existingTasks: Task[] = []
): {
  created: TaskCreateInput[];
  patches: Array<{ id: string; input: GoalUpdateInput }>;
  repo: GoalHandoffRepo;
  statusFlips: Array<{ id: string; status?: string }>;
} {
  const patches: Array<{ id: string; input: GoalUpdateInput }> = [];
  const created: TaskCreateInput[] = [];
  const statusFlips: Array<{ id: string; status?: string }> = [];
  const repo: GoalHandoffRepo = {
    createTask: (input) => {
      created.push(input);
      const task = makeTask();
      return Promise.resolve({
        ...task,
        ...(input.title ? { title: input.title } : {}),
        ...(input.goal_id ? { goal_id: input.goal_id } : {}),
      });
    },
    getGoal: (id) =>
      Promise.resolve(goal && goal.id === id ? { ...goal } : null),
    listTasksPaginated: () => Promise.resolve({ data: existingTasks }),
    loadTaskStatuses: () => Promise.resolve(new Map()),
    updateGoal: (id, input) => {
      patches.push({ id, input });
      return Promise.resolve(goal ? { ...goal, ...input } : null);
    },
    updateTask: (id, input) => {
      statusFlips.push({
        id,
        ...(input.status ? { status: input.status } : {}),
      });
      const target = existingTasks.find((t) => t.id === id);
      return Promise.resolve(
        target ? { ...target, status: input.status ?? target.status } : null
      );
    },
  };
  return { created, patches, repo, statusFlips };
}

function fakeQueue() {
  const sent: Array<{ payload: Record<string, unknown>; queue: string }> = [];
  return {
    sent,
    queue: {
      send: (queue: string, payload: Record<string, unknown>) => {
        sent.push({ payload, queue });
        return Promise.resolve(1);
      },
      sendBatch: () => Promise.resolve([1]),
    } as never,
  };
}

describe("handoffGoalToCoordinator", () => {
  it("assigns the coordinator, activates a planned goal, and materializes a coordination task on the agent dispatch queue", async () => {
    const { created, patches, repo } = makeRepo(
      makeGoal({ status: "planned" })
    );
    const { queue, sent } = fakeQueue();

    const result = await handoffGoalToCoordinator(
      { queue, repo, tenantId: "tenant" },
      "goal-1",
      "user-9"
    );

    expect(patches[0].input.owner_agent_type_key).toBe("engenty.coordinator");
    expect(patches[0].input.status).toBe("active");
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      goal_id: "goal-1",
      primary_assignee_agent_type_key: ENGENTY_COORDINATOR_AGENT_TYPE_KEY,
      primary_assignee_kind: "agent",
    });
    expect(created[0].description).toContain("goal_id: goal-1");
    expect(result.dispatched).toBe(true);
    expect(result.task.title).toContain("Test goal");
    // Rides the SAME queue as every other agent task — no special coordinator
    // queue, so the run gets the full task-job substrate.
    expect(sent).toHaveLength(1);
    expect(sent[0].queue).toBe(AGENT_TASK_DISPATCH_QUEUE);
    expect(sent[0].payload).toMatchObject({
      agent_type_key: ENGENTY_COORDINATOR_AGENT_TYPE_KEY,
      tenant_id: "tenant",
    });
  });

  it("reuses an open unclaimed coordination task instead of stacking a sibling", async () => {
    const open = makeTask({});
    const { created, repo } = makeRepo(makeGoal({ status: "active" }), [open]);
    const { queue, sent } = fakeQueue();

    const result = await handoffGoalToCoordinator(
      { queue, repo, tenantId: "tenant" },
      "goal-1"
    );

    expect(created).toHaveLength(0);
    expect(result.task.id).toBe(open.id);
    expect(sent).toHaveLength(1);
  });

  it("leaves a claimed coordination task alone (planning run already in flight)", async () => {
    const running = {
      ...makeTask({}),
      checkout_run_id: "run-1",
      status: "in_progress",
    };
    const { created, repo } = makeRepo(makeGoal({ status: "active" }), [
      running,
    ]);
    const { queue, sent } = fakeQueue();

    const result = await handoffGoalToCoordinator(
      { queue, repo, tenantId: "tenant" },
      "goal-1"
    );

    expect(created).toHaveLength(0);
    expect(result.dispatched).toBe(false);
    expect(result.task.id).toBe(running.id);
    expect(sent).toHaveLength(0);
  });

  it("starts a NEW planning cycle when the previous one parked at in_review", async () => {
    const reviewed = { ...makeTask({}), status: "in_review" };
    const { created, repo } = makeRepo(makeGoal({ status: "active" }), [
      reviewed,
    ]);
    const { queue } = fakeQueue();

    const result = await handoffGoalToCoordinator(
      { queue, repo, tenantId: "tenant" },
      "goal-1"
    );

    expect(created).toHaveLength(1);
    expect(result.task.id).not.toBe(reviewed.id);
  });

  it("does not change status when the goal is already active", async () => {
    const { patches, repo } = makeRepo(makeGoal({ status: "active" }));
    const { queue } = fakeQueue();

    await handoffGoalToCoordinator(
      { queue, repo, tenantId: "tenant" },
      "goal-1"
    );

    expect(patches[0].input.owner_agent_type_key).toBe("engenty.coordinator");
    expect(patches[0].input.status).toBeUndefined();
  });

  it("still creates the task but reports dispatched=false when no queue is configured", async () => {
    const { created, repo } = makeRepo(makeGoal());
    const result = await handoffGoalToCoordinator(
      { queue: null, repo, tenantId: "tenant" },
      "goal-1"
    );
    expect(created).toHaveLength(1);
    expect(result.dispatched).toBe(false);
  });

  it("throws goal_not_found for a missing goal", async () => {
    const { repo } = makeRepo(null);
    await expect(
      handoffGoalToCoordinator({ repo, tenantId: "tenant" }, "goal-x")
    ).rejects.toThrow("goal_not_found");
  });

  it("throws goal_terminal for an achieved or cancelled goal", async () => {
    for (const status of ["achieved", "cancelled"] as const) {
      const { repo } = makeRepo(makeGoal({ status }));
      await expect(
        handoffGoalToCoordinator({ repo, tenantId: "tenant" }, "goal-1")
      ).rejects.toThrow("goal_terminal");
    }
  });
});
