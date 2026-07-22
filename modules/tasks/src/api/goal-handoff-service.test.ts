import { describe, expect, it } from "vitest";
import type { Goal, GoalUpdateInput } from "../schema/types.js";
import {
  type GoalHandoffRepo,
  handoffGoalToCoordinator,
} from "./goal-handoff-service.js";

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

function makeRepo(goal: Goal | null): {
  patches: Array<{ id: string; input: GoalUpdateInput }>;
  repo: GoalHandoffRepo;
} {
  const patches: Array<{ id: string; input: GoalUpdateInput }> = [];
  const repo: GoalHandoffRepo = {
    getGoal: (id) =>
      Promise.resolve(goal && goal.id === id ? { ...goal } : null),
    updateGoal: (id, input) => {
      patches.push({ id, input });
      return Promise.resolve(goal ? { ...goal, ...input } : null);
    },
  };
  return { patches, repo };
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
  it("assigns the coordinator, activates a planned goal, and enqueues a run", async () => {
    const { patches, repo } = makeRepo(makeGoal({ status: "planned" }));
    const { queue, sent } = fakeQueue();

    const result = await handoffGoalToCoordinator(
      { queue, repo, tenantId: "tenant" },
      "goal-1",
      "user-9"
    );

    expect(patches[0].input.owner_agent_type_key).toBe("engenty.coordinator");
    expect(patches[0].input.status).toBe("active");
    expect(result.dispatched).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].queue).toBe("agent_coordinator_dispatch");
    expect(sent[0].payload).toMatchObject({
      goal_id: "goal-1",
      tenant_id: "tenant",
      triggered_by_user_id: "user-9",
    });
  });

  it("does not change status when the goal is already active", async () => {
    const { patches, repo } = makeRepo(makeGoal({ status: "active" }));
    const { queue } = fakeQueue();

    await handoffGoalToCoordinator({ queue, repo, tenantId: "tenant" }, "goal-1");

    expect(patches[0].input.owner_agent_type_key).toBe("engenty.coordinator");
    expect(patches[0].input.status).toBeUndefined();
  });

  it("reports dispatched=false when no queue is configured", async () => {
    const { repo } = makeRepo(makeGoal());
    const result = await handoffGoalToCoordinator(
      { queue: null, repo, tenantId: "tenant" },
      "goal-1"
    );
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
