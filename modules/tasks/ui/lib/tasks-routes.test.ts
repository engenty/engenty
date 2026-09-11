// Tasks routes — builder and matcher unit tests.
// Acceptance criteria: taskDetail("a/b") encodes the slash; pattern/builder base agree.
import { describe, expect, it } from "vitest";
import {
  isBriefingPath,
  isSettingsPath,
  isSpaceRootPath,
  isTaskDetailPath,
  isTasksListPath,
  tasksPaths,
  tasksPathsForSpace,
  tasksRoutePatterns,
} from "./tasks-routes.js";

const TASK_ID = "22222222-2222-4222-8222-222222222222";

describe("tasksRoutePatterns", () => {
  it("patterns use :id, never a concrete id", () => {
    expect(tasksRoutePatterns.taskDetail).toContain(":id");
  });

  it("all patterns start with /mdl/tasks", () => {
    for (const v of Object.values(tasksRoutePatterns)) {
      expect(v).toMatch(/^\/mdl\/tasks/);
    }
  });
});

describe("tasksPaths builders", () => {
  it("encodes slashes in a/b style ids", () => {
    expect(tasksPaths.taskDetail("a/b")).toBe("/mdl/tasks/a%2Fb");
  });

  it("static builders agree with pattern base", () => {
    expect(tasksPaths.list).toBe("/mdl/tasks/list");
    expect(tasksPaths.briefing).toBe("/mdl/tasks/briefing");
    expect(tasksPaths.settings).toBe("/mdl/tasks/settings");
    expect(tasksPaths.root).toBe("/mdl/tasks");
  });

  it("builds Space-scoped links without leaving the Space", () => {
    const paths = tasksPathsForSpace("Sales / DACH");
    expect(paths.list).toBe("/s/Sales%20%2F%20DACH/tasks/list");
    expect(paths.taskDetail("a/b")).toBe("/s/Sales%20%2F%20DACH/tasks/a%2Fb");
  });

  it("falls back to module routes outside a Space", () => {
    expect(tasksPathsForSpace(null)).toBe(tasksPaths);
  });
});

describe("matchers", () => {
  it("detects briefing routes", () => {
    expect(isBriefingPath("/mdl/tasks")).toBe(true);
    expect(isBriefingPath("/mdl/tasks/")).toBe(true);
    expect(isBriefingPath("/mdl/tasks/briefing")).toBe(true);
    expect(isBriefingPath("/mdl/tasks/list")).toBe(false);
  });

  it("detects the space home, not Plan or a desk", () => {
    expect(isSpaceRootPath("/s/tpl-client")).toBe(true);
    expect(isSpaceRootPath("/s/tpl-client/")).toBe(true);
    expect(isSpaceRootPath("/s/tpl-client/tasks/briefing")).toBe(false);
    expect(isSpaceRootPath("/s/tpl-client/agents/engenty.coordinator")).toBe(
      false
    );
    expect(isSpaceRootPath("/mdl/tasks/briefing")).toBe(false);
  });

  it("detects tasks list and task detail routes", () => {
    expect(isTasksListPath("/mdl/tasks/list")).toBe(true);
    expect(isTaskDetailPath(`/mdl/tasks/${TASK_ID}`)).toBe(TASK_ID);
    expect(isTaskDetailPath(`/mdl/tasks/${TASK_ID}/edit`)).toBe(TASK_ID);
    expect(isTaskDetailPath("/mdl/tasks/briefing")).toBeNull();
    expect(isTaskDetailPath("/mdl/tasks/not-a-uuid")).toBeNull();
  });

  it("detects settings routes", () => {
    expect(isSettingsPath("/mdl/tasks/settings")).toBe(true);
    expect(isSettingsPath("/mdl/tasks/settings/statuses")).toBe(true);
    expect(isSettingsPath("/mdl/tasks/list")).toBe(false);
  });
});
