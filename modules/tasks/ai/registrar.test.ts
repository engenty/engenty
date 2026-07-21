import { unregisterAiRegistration } from "@engenty/ai-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TASKS_ASSIST_AGENT_ID } from "./agents/tasks-assist.js";
import { tasksAiRegistration, tasksDynamicAiCapability } from "./registrar.js";

const noopInvokeTasksOperation = vi.fn(async () => null);

describe("tasksAiRegistration", () => {
  afterEach(() => {
    unregisterAiRegistration("tasks");
  });

  it("exposes tasks.assist with tasks routes and task-workflow skill", () => {
    const registration = tasksAiRegistration({
      invokeTasksOperation: noopInvokeTasksOperation,
    });
    const agent = registration.agents?.find(
      (item) => item.id === TASKS_ASSIST_AGENT_ID
    );

    expect(registration.module_id).toBe("tasks");
    expect(agent).toBeTruthy();
    expect(agent?.skills).toContain("task-workflow");

    const skillNames = new Set(registration.skills?.map((skill) => skill.name));
    expect(skillNames.has("task-workflow")).toBe(true);

    const tools = agent?.build_tools({
      action: "chat",
      moduleId: "tasks",
      scope: { entityId: "task-1", task_snapshot: { title: "Ship tasks" } },
      scopeId: "default",
      tenantId: "tenant-1",
    });

    expect(tools).toBeDefined();
    expect(tools).toHaveProperty("engentyApiCatalog");
  });

  it("exports dynamic capability metadata for apps/ai assembly", () => {
    const registration = tasksAiRegistration({
      invokeTasksOperation: noopInvokeTasksOperation,
    });
    const capability = tasksDynamicAiCapability({
      invokeTasksOperation: noopInvokeTasksOperation,
    });

    expect(registration.dynamic?.agent_configs?.[0]?.id).toBe(
      TASKS_ASSIST_AGENT_ID
    );
    expect(registration.dynamic?.skills?.["task-workflow"]).toContain(
      "tasks_checkout"
    );
    expect(capability.agentConfigs?.[0]?.toolIds).toEqual([
      "engenty_tools_search",
      "engenty_tool_execute",
      "memory_save",
      "memory_record_search",
      "memory_record_archive",
    ]);
    expect(capability.skills?.["task-workflow"]).toContain("task-workflow");
  });

  it("tasks.assist agent config declares staff workspace with /task checkout mount", () => {
    const capability = tasksDynamicAiCapability({
      invokeTasksOperation: noopInvokeTasksOperation,
    });
    const config = capability.agentConfigs?.[0];
    expect(config?.workspace).toMatchObject({ preset: "staff" });
  });
});
