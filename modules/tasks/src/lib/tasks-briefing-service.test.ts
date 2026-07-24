import { describe, expect, it } from "vitest";
import { BUILTIN_TASK_STATUS_DEFINITIONS } from "../../task-status-builtins.js";
import type { Task, TaskSettings } from "../schema/types.js";
import { definitionsToSettingsSlice } from "./task-status-settings.js";
import {
  buildTasksBriefingSnapshot,
  buildTasksBriefingSummary,
} from "./tasks-briefing-service.js";

const USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const settings: TaskSettings = {
  identifier_prefix: "ENG",
  stale_after_days: 7,
  ...definitionsToSettingsSlice(BUILTIN_TASK_STATUS_DEFINITIONS),
};

function makeTask(
  overrides: Partial<Task> & Pick<Task, "id" | "status">
): Task {
  const now = new Date().toISOString();
  return {
    id: overrides.id,
    tenant_id: "tenant",
    scope_id: "scope",
    identifier: overrides.identifier ?? "ENG-1",
    title: overrides.title ?? "Task",
    description: null,
    status: overrides.status,
    priority: overrides.priority ?? "medium",
    goal_id: null,
    parent_id: null,
    primary_assignee_kind: overrides.primary_assignee_kind ?? "none",
    primary_assignee_user_id: overrides.primary_assignee_user_id ?? null,
    primary_assignee_agent_type_key:
      overrides.primary_assignee_agent_type_key ?? null,
    created_by_user_id: null,
    created_by_agent_type_key: null,
    due_date: overrides.due_date ?? null,
    started_at: null,
    completed_at: null,
    cancelled_at: null,
    blocked_by_task_ids: [],
    checkout_run_id: null,
    created_at: now,
    updated_at: overrides.updated_at ?? now,
    project_id: null,
  };
}

describe("buildTasksBriefingSnapshot", () => {
  it("puts in-progress tasks in focus for oversight mode", () => {
    const tasks = [
      makeTask({
        id: "1",
        status: "in_progress",
        primary_assignee_user_id: USER_A,
      }),
      makeTask({
        id: "2",
        status: "todo",
      }),
    ];

    const snapshot = buildTasksBriefingSnapshot(tasks, settings, {
      mode: "oversight",
    });

    expect(snapshot.focus_items.map((item) => item.task.id)).toEqual(["1"]);
  });

  it("limits focus to assigned user in personal mode", () => {
    const tasks = [
      makeTask({
        id: "mine",
        status: "in_progress",
        primary_assignee_user_id: USER_A,
      }),
      makeTask({
        id: "theirs",
        status: "in_progress",
        primary_assignee_user_id: USER_B,
      }),
    ];

    const snapshot = buildTasksBriefingSnapshot(tasks, settings, {
      mode: "personal",
      userId: USER_A,
    });

    expect(snapshot.focus_items.map((item) => item.task.id)).toEqual(["mine"]);
  });

  it("classifies overdue and critical tasks as attention items", () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    const tasks = [
      makeTask({
        id: "overdue",
        status: "todo",
        due_date: yesterday,
      }),
      makeTask({
        id: "critical",
        status: "todo",
        priority: "critical",
      }),
    ];

    const snapshot = buildTasksBriefingSnapshot(tasks, settings, {
      mode: "oversight",
    });

    expect(snapshot.attention_items.map((item) => item.task.id).sort()).toEqual(
      ["critical", "overdue"]
    );
    expect(
      snapshot.attention_items.find((item) => item.task.id === "overdue")
        ?.reason
    ).toBe("overdue");
  });

  it("marks stale open tasks using settings.stale_after_days", () => {
    const staleUpdated = new Date(
      Date.now() - settings.stale_after_days * 86_400_000
    ).toISOString();
    const tasks = [
      makeTask({
        id: "stale",
        status: "todo",
        updated_at: staleUpdated,
      }),
      makeTask({
        id: "fresh",
        status: "todo",
      }),
    ];

    const snapshot = buildTasksBriefingSnapshot(tasks, settings, {
      mode: "oversight",
    });

    expect(snapshot.stale_items.map((item) => item.task.id)).toEqual(["stale"]);
  });

  it("computes summary metrics for oversight mode", () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    const tasks = [
      makeTask({ id: "open", status: "todo" }),
      makeTask({ id: "progress", status: "in_progress" }),
      makeTask({ id: "blocked", status: "blocked" }),
      makeTask({
        id: "overdue",
        status: "todo",
        due_date: yesterday,
      }),
      makeTask({ id: "done", status: "done" }),
    ];

    const summary = buildTasksBriefingSummary(tasks, settings, {
      mode: "oversight",
    });

    expect(summary).toEqual({
      open: 4,
      in_progress: 1,
      blocked: 1,
      waiting: 1,
      stale: 0,
      attention: 2,
    });
  });
});
