import { describe, expect, it } from "vitest";
import {
  isBriefingPath,
  isSettingsPath,
  isTaskDetailPath,
  isTasksListPath,
} from "./tasks-routes.js";

const TASK_ID = "22222222-2222-4222-8222-222222222222";

describe("tasks sidebar path helpers", () => {
  it("detects briefing routes", () => {
    expect(isBriefingPath("/mdl/tasks")).toBe(true);
    expect(isBriefingPath("/mdl/tasks/briefing")).toBe(true);
    expect(isBriefingPath("/mdl/tasks/list")).toBe(false);
  });

  it("detects tasks list and detail routes", () => {
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
