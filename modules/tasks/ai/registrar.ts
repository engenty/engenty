// Tasks AI surface — declared via defineModuleAi (Phase 5).
// agents/tasks.assist/agent.json + AGENTS.md, skills/*/SKILL.md.
import type {
  AiRegistration,
  DynamicAiModuleCapability,
} from "@engenty/ai-core";
import { defineModuleAi } from "@engenty/ai-core";
import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import { createTasksAssistAgentDefinition } from "./agents/tasks-assist.js";

const moduleAi = defineModuleAi({
  agentDefinitions: () => [createTasksAssistAgentDefinition()],
  dir: import.meta.url,
  moduleId: "tasks",
});

export function tasksDynamicAiCapability(_options: {
  invokeTasksOperation: PluginServerGatewayCaller["invokeOperation"];
}): DynamicAiModuleCapability {
  return moduleAi.dynamicCapability();
}

export function tasksAiRegistration(_options: {
  invokeTasksOperation: PluginServerGatewayCaller["invokeOperation"];
}): AiRegistration {
  return moduleAi.aiRegistration();
}
