import { describe, expect, it } from "vitest";
import type { Task, TaskSettings } from "../../src/schema/types.js";
import {
  optimisticTask,
  taskMatchesList,
} from "./task-list-optimistic-cache.js";
import { patchTask, patchTaskSettings } from "./task-optimistic-cache.js";

describe("task optimistic cache reducers", () => {
  it("patches settings without mutating the snapshot", () => {
    const current = {
      default_task_statuses: ["todo"],
      identifier_prefix: "ENG",
      stale_after_days: 14,
      task_status_definitions: [],
    } satisfies TaskSettings;

    const patched = patchTaskSettings(current, { stale_after_days: 7 });

    expect(patched).toEqual({ ...current, stale_after_days: 7 });
    expect(current.stale_after_days).toBe(14);
  });

  it("patches task detail entities immutably", () => {
    const task = { id: "task-1", title: "Before" } as Task;

    expect(patchTask(task, { title: "After" })?.title).toBe("After");
    expect(task.title).toBe("Before");
  });

  it("does not synthesize detail data when the query is uncached", () => {
    expect(patchTask(undefined, { title: "After" })).toBeUndefined();
  });
});

describe("task list optimistic cache reducers", () => {
  it("builds temporary task rows", () => {
    const task = optimisticTask(
      { space_id: "space-1", title: "Immediate" },
      "opt_task"
    );
    expect(task).toMatchObject({
      id: "opt_task",
      identifier: "opt_task",
      status: "todo",
    });
  });

  it("projects move semantics for filtered task lists", () => {
    const task = optimisticTask(
      { space_id: "space-1", status: "done", title: "Moved" },
      "task-1"
    );
    expect(taskMatchesList(task, { space_id: "space-1", status: "done" })).toBe(
      true
    );
    expect(taskMatchesList(task, { status: "todo" })).toBe(false);
  });
});
