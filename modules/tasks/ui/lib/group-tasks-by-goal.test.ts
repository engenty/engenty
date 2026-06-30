import { describe, expect, it } from "vitest";
import type { Goal, Task } from "../../src/schema/types.js";
import { groupTasksByGoal } from "./group-tasks-by-goal.js";

function makeTask(
  overrides: Partial<Task> & Pick<Task, "id" | "goal_id">
): Task {
  return {
    cancelled_at: null,
    checkout_run_id: null,
    completed_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    created_by_agent_type_key: null,
    created_by_user_id: null,
    description: null,
    due_date: null,
    identifier: "T-1",
    parent_id: null,
    primary_assignee_agent_type_key: null,
    primary_assignee_kind: "none",
    primary_assignee_user_id: null,
    priority: "medium",
    request_depth: 0,
    scope_id: "scope-1",
    started_at: null,
    status: "todo",
    tenant_id: "tenant-1",
    title: "Task",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeGoal(overrides: Partial<Goal> & Pick<Goal, "id" | "title">): Goal {
  return {
    created_at: "2026-01-01T00:00:00.000Z",
    description: null,
    owner_user_id: null,
    parent_id: null,
    scope_id: "scope-1",
    status: "active",
    target_date: null,
    tenant_id: "tenant-1",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("groupTasksByGoal", () => {
  it("separates general tasks and groups by goal title order", () => {
    const goals = [
      makeGoal({ id: "goal-b", title: "Beta" }),
      makeGoal({ id: "goal-a", title: "Alpha" }),
    ];
    const tasks = [
      makeTask({ id: "t1", goal_id: null, title: "General" }),
      makeTask({ id: "t2", goal_id: "goal-b", title: "In Beta" }),
      makeTask({ id: "t3", goal_id: "goal-a", title: "In Alpha" }),
    ];

    const grouped = groupTasksByGoal(tasks, goals);

    expect(grouped.generalTasks.map((task) => task.id)).toEqual(["t1"]);
    expect(grouped.goalSections.map((section) => section.goal.id)).toEqual([
      "goal-a",
      "goal-b",
    ]);
    expect(grouped.goalSections[0]?.tasks.map((task) => task.id)).toEqual([
      "t3",
    ]);
  });

  it("includes goals with no tasks as empty sections", () => {
    const goals = [
      makeGoal({ id: "goal-a", title: "Alpha" }),
      makeGoal({ id: "goal-b", title: "Beta" }),
    ];
    const tasks = [
      makeTask({ id: "t1", goal_id: "goal-a", title: "Only Alpha" }),
    ];

    const grouped = groupTasksByGoal(tasks, goals);

    expect(grouped.goalSections.map((section) => section.goal.id)).toEqual([
      "goal-a",
      "goal-b",
    ]);
    expect(grouped.goalSections[0]?.tasks.map((task) => task.id)).toEqual([
      "t1",
    ]);
    expect(grouped.goalSections[1]?.tasks).toEqual([]);
  });

  it("falls back to goal id when goal metadata is missing", () => {
    const tasks = [
      makeTask({ id: "t1", goal_id: "missing-goal", title: "Orphan" }),
    ];
    const grouped = groupTasksByGoal(tasks, []);

    expect(grouped.generalTasks).toEqual([]);
    expect(grouped.goalSections).toHaveLength(1);
    expect(grouped.goalSections[0]?.goal.title).toBe("missing-goal");
  });
});
