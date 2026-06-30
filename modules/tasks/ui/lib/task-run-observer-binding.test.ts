import { describe, expect, it } from "vitest";
import type { Task } from "../../src/schema/types.js";
import {
  buildTaskRunObserverRouteContext,
  buildWorkOnTaskRunPrompt,
  taskRunObserverHostKey,
  taskRunObserverStableSessionKey,
} from "./task-run-observer-binding.js";

const sampleTask: Task = {
  checkout_run_id: null,
  collaborator_user_ids: [],
  created_at: "2026-05-01T00:00:00.000Z",
  description: null,
  due_date: null,
  goal_id: "goal-1",
  id: "task-1",
  identifier: "ENG-1",
  primary_assignee_agent_type_key: null,
  primary_assignee_kind: "none",
  primary_assignee_user_id: null,
  priority: "medium",
  status: "todo",
  tenant_id: "tenant-1",
  title: "Sample task",
  updated_at: "2026-05-01T00:00:00.000Z",
};

describe("taskRunObserverStableSessionKey", () => {
  it("scopes observe lane per task", () => {
    expect(taskRunObserverStableSessionKey("abc")).toBe("task:run:abc");
    expect(taskRunObserverHostKey("abc")).toBe("task:run:abc");
  });
});

describe("buildTaskRunObserverRouteContext", () => {
  it("includes task routing scope without copilot launch keys", () => {
    const ctx = buildTaskRunObserverRouteContext(sampleTask);
    expect(ctx.moduleId).toBe("tasks");
    expect(ctx.routeKey).toBe("detail");
    expect(ctx.scope).toMatchObject({
      task_id: "task-1",
      task_identifier: "ENG-1",
      entity_id: "task-1",
    });
    expect(ctx.scope).not.toHaveProperty("copilotLaunchId");
    expect(ctx.scope).not.toHaveProperty("copilotStartMode");
  });
});

describe("buildWorkOnTaskRunPrompt", () => {
  it("mentions task identifier and title", () => {
    expect(buildWorkOnTaskRunPrompt(sampleTask)).toContain("ENG-1");
    expect(buildWorkOnTaskRunPrompt(sampleTask)).toContain("Sample task");
  });
});
