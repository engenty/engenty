import { describe, expect, it } from "vitest";
import type { Goal, Task } from "../../src/schema/types.js";
import {
  collectTaskAgentFilterOptions,
  collectTaskUserFilterOptions,
  DEFAULT_TASKS_SIDEBAR_PREFS,
  organizeSidebarTasks,
  type TasksSidebarOrganizationLabels,
} from "./tasks-sidebar-organization.js";

const LABELS: TasksSidebarOrganizationLabels = {
  assigneeUnassigned: "Unassigned",
  dueLater: "Later",
  dueNoDate: "No due date",
  dueOverdue: "Overdue",
  dueThisWeek: "This week",
  dueToday: "Today",
  dueTomorrow: "Tomorrow",
  goalGeneral: "General",
  goalMissing: "Missing goal",
  goalStatus: {
    planned: "Planned",
    active: "Active",
    achieved: "Achieved",
    cancelled: "Cancelled",
  },
  priority: {
    critical: "Critical",
    high: "High",
    medium: "Medium",
    low: "Low",
  },
  projectNone: "No project",
  status: (statusId) => statusId,
};

function makeTask(overrides: Partial<Task> & Pick<Task, "id">): Task {
  return {
    blocked_by_task_ids: [],
    cancelled_at: null,
    checkout_run_id: null,
    completed_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    created_by_agent_type_key: null,
    created_by_user_id: null,
    description: null,
    due_date: null,
    goal_id: null,
    identifier: "T-1",
    parent_id: null,
    primary_assignee_agent_type_key: null,
    primary_assignee_kind: "none",
    primary_assignee_user_id: null,
    priority: "medium",
    scope_id: "scope-1",
    started_at: null,
    status: "todo",
    tenant_id: "tenant-1",
    title: "Task",
    updated_at: "2026-01-02T00:00:00.000Z",
    project_id: null,
    ...overrides,
  };
}

function makeGoal(overrides: Partial<Goal> & Pick<Goal, "id" | "title">): Goal {
  return {
    created_at: "2026-01-01T00:00:00.000Z",
    description: null,
    level: "team",
    owner_agent_id: null,
    owner_user_id: null,
    owner_agent_type_key: null,
    parent_id: null,
    scope_id: "scope-1",
    status: "active",
    target_date: null,
    tenant_id: "tenant-1",
    updated_at: "2026-01-02T00:00:00.000Z",
    project_id: null,
    ...overrides,
  };
}

describe("organizeSidebarTasks", () => {
  it("returns a flat list when groupBy is none", () => {
    const tasks = [
      makeTask({ id: "t1", title: "Alpha" }),
      makeTask({ id: "t2", title: "Beta" }),
    ];

    const groups = organizeSidebarTasks({
      goalTitleById: new Map(),
      labels: LABELS,
      prefs: { ...DEFAULT_TASKS_SIDEBAR_PREFS.tasks, groupBy: "none" },
      statusDefinitions: [{ color: "slate", id: "todo", label: "Todo" }],
      tasks,
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.id).toBe("all");
    expect(groups[0]?.items.map((task) => task.id)).toEqual(["t1", "t2"]);
  });

  it("groups tasks by status and sorts groups alphabetically", () => {
    const tasks = [
      makeTask({ id: "t1", status: "done", title: "Done task" }),
      makeTask({ id: "t2", status: "todo", title: "Todo task" }),
    ];

    const groups = organizeSidebarTasks({
      goalTitleById: new Map(),
      labels: LABELS,
      prefs: { ...DEFAULT_TASKS_SIDEBAR_PREFS.tasks, groupBy: "status" },
      statusDefinitions: [
        { color: "slate", id: "todo", label: "Todo" },
        { color: "green", id: "done", label: "Done" },
      ],
      tasks,
    });

    expect(groups.map((group) => group.id)).toEqual([
      "status:done",
      "status:todo",
    ]);
    expect(groups[0]?.count).toBe(1);
    expect(groups[1]?.count).toBe(1);
  });

  it("filters by assignee and status", () => {
    const tasks = [
      makeTask({
        id: "t1",
        primary_assignee_kind: "user",
        primary_assignee_user_id: "user-1",
        status: "todo",
      }),
      makeTask({
        id: "t2",
        primary_assignee_kind: "none",
        status: "done",
      }),
    ];

    const groups = organizeSidebarTasks({
      goalTitleById: new Map(),
      labels: LABELS,
      prefs: {
        ...DEFAULT_TASKS_SIDEBAR_PREFS.tasks,
        assigneeFilter: "user:user-1",
        groupBy: "none",
        status: "todo",
      },
      statusDefinitions: [{ color: "slate", id: "todo", label: "Todo" }],
      tasks,
    });

    expect(groups[0]?.items.map((task) => task.id)).toEqual(["t1"]);
  });

  it("groups tasks by goal title", () => {
    const tasks = [
      makeTask({ id: "t1", goal_id: "goal-a", title: "In goal" }),
      makeTask({ id: "t2", goal_id: null, title: "General" }),
    ];

    const groups = organizeSidebarTasks({
      goalTitleById: new Map([["goal-a", "Alpha goal"]]),
      labels: LABELS,
      prefs: { ...DEFAULT_TASKS_SIDEBAR_PREFS.tasks, groupBy: "goal" },
      statusDefinitions: [{ color: "slate", id: "todo", label: "Todo" }],
      tasks,
    });

    expect(groups.map((group) => group.label)).toEqual([
      "Alpha goal",
      "General",
    ]);
  });
});

describe("collectTaskFilterOptions", () => {
  it("collects unique agent and user assignee options", () => {
    const tasks = [
      makeTask({
        id: "t1",
        primary_assignee_agent_type_key: "dynamic_supervisor",
        primary_assignee_kind: "agent",
      }),
      makeTask({
        id: "t2",
        primary_assignee_kind: "user",
        primary_assignee_user_id: "user-1",
      }),
    ];

    expect(collectTaskAgentFilterOptions(tasks)).toEqual([
      "dynamic_supervisor",
    ]);
    expect(
      collectTaskUserFilterOptions(
        tasks,
        new Map([["user-1", { full_name: "Alex", id: "user-1" }]])
      )
    ).toEqual([{ id: "user-1", label: "Alex" }]);
  });
});
