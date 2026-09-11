import { unregisterAiRegistration } from "@engenty/ai-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tasksAiRegistration, tasksDynamicAiCapability } from "./registrar.js";

const TASKS_ASSIST_AGENT_ID = "tasks.assist";

const noopInvokeTasksOperation = vi.fn(async () => null);

describe("tasksAiRegistration", () => {
  afterEach(() => {
    unregisterAiRegistration("tasks");
  });

  it("exposes tasks.assist with the task-workflow skill", () => {
    const registration = tasksAiRegistration({
      invokeTasksOperation: noopInvokeTasksOperation,
    });
    const agent = registration.dynamic?.agent_configs?.find(
      (item) => item.id === TASKS_ASSIST_AGENT_ID
    );

    expect(registration.module_id).toBe("tasks");
    expect(agent).toBeTruthy();
    expect(agent?.skillIds).toContain("task-workflow");

    const skillNames = new Set(registration.skills?.map((skill) => skill.name));
    expect(skillNames.has("task-workflow")).toBe(true);
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
