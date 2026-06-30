// Tasks routes — builder and matcher unit tests.
// Acceptance criteria: routineDetail("a/b") encodes the slash; pattern/builder base agree.
import { describe, expect, it } from "vitest";
import {
  isBriefingPath,
  isGoalDetailPath,
  isGoalsListPath,
  isRoutinesPath,
  isSettingsPath,
  isTaskDetailPath,
  isTasksListPath,
  tasksPaths,
  tasksRoutePatterns,
} from "./tasks-routes.js";

const GOAL_ID = "11111111-1111-4111-8111-111111111111";
const TASK_ID = "22222222-2222-4222-8222-222222222222";
const ROUTINE_ID = "custom:33333333-3333-4333-8333-333333333333";

describe("tasksRoutePatterns", () => {
  it("patterns use :id, never a concrete id", () => {
    expect(tasksRoutePatterns.routineDetail).toContain(":id");
    expect(tasksRoutePatterns.goalDetail).toContain(":id");
    expect(tasksRoutePatterns.taskDetail).toContain(":id");
  });

  it("all patterns start with /mdl/tasks", () => {
    for (const v of Object.values(tasksRoutePatterns)) {
      expect(v).toMatch(/^\/mdl\/tasks/);
    }
  });
});

describe("tasksPaths builders", () => {
  it("encodes slashes in routine ids (custom:uuid form)", () => {
    const url = tasksPaths.routineDetail(ROUTINE_ID);
    expect(url).not.toContain("custom:"); // raw colon must not appear
    expect(url).toContain(encodeURIComponent(ROUTINE_ID));
  });

  it("encodes slashes in a/b style ids", () => {
    expect(tasksPaths.routineDetail("a/b")).toBe("/mdl/tasks/routines/a%2Fb");
    expect(tasksPaths.goalDetail("a/b")).toBe("/mdl/tasks/goals/a%2Fb");
    expect(tasksPaths.taskDetail("a/b")).toBe("/mdl/tasks/a%2Fb");
  });

  it("static builders agree with pattern base", () => {
    expect(tasksPaths.routines).toBe("/mdl/tasks/routines");
    expect(tasksPaths.goals).toBe("/mdl/tasks/goals");
    expect(tasksPaths.list).toBe("/mdl/tasks/list");
    expect(tasksPaths.briefing).toBe("/mdl/tasks/briefing");
    expect(tasksPaths.settings).toBe("/mdl/tasks/settings");
    expect(tasksPaths.root).toBe("/mdl/tasks");
  });
});

describe("matchers", () => {
  it("detects briefing routes", () => {
    expect(isBriefingPath("/mdl/tasks")).toBe(true);
    expect(isBriefingPath("/mdl/tasks/")).toBe(true);
    expect(isBriefingPath("/mdl/tasks/briefing")).toBe(true);
    expect(isBriefingPath("/mdl/tasks/list")).toBe(false);
  });

  it("detects routines path", () => {
    expect(isRoutinesPath("/mdl/tasks/routines")).toBe(true);
    expect(isRoutinesPath("/mdl/tasks/routines/some-id")).toBe(true);
    expect(isRoutinesPath("/mdl/tasks/list")).toBe(false);
  });

  it("detects goals list and detail routes", () => {
    expect(isGoalsListPath("/mdl/tasks/goals")).toBe(true);
    expect(isGoalsListPath(`/mdl/tasks/goals/${GOAL_ID}`)).toBe(false);
    expect(isGoalDetailPath(`/mdl/tasks/goals/${GOAL_ID}`)).toBe(GOAL_ID);
    expect(isGoalDetailPath(`/mdl/tasks/goals/${GOAL_ID}/edit`)).toBe(GOAL_ID);
    expect(isGoalDetailPath("/mdl/tasks/goals/not-a-uuid")).toBeNull();
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
