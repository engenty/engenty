// Projects AI surface — declared via defineModuleAi (Phase 5).
// No specialist agent (workforce plan R1); copilot + skills cover the module.
// Tools are still registered so the copilot can call them via module capability.
// Skills auto-loaded from ai/skills/*/SKILL.md by defineModuleAi.
import type {
  AiRegistration,
  DynamicAiModuleCapability,
} from "@engenty/ai-core";
import { defineModuleAi } from "@engenty/ai-core";
import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import {
  buildLoadProjectTool,
  PROJECTS_LOAD_PROJECT_TOOL_ID,
} from "./tools/load-project.js";
import {
  buildLoadProjectTasksTool,
  PROJECTS_LOAD_PROJECT_TASKS_TOOL_ID,
} from "./tools/load-project-tasks.js";
import {
  buildLoadProjectsListTool,
  PROJECTS_LOAD_PROJECTS_LIST_TOOL_ID,
} from "./tools/load-projects-list.js";
import {
  buildManageProjectTool,
  PROJECTS_MANAGE_PROJECT_TOOL_ID,
} from "./tools/manage-project.js";
import {
  buildManageProjectPhaseTool,
  PROJECTS_MANAGE_PHASE_TOOL_ID,
} from "./tools/manage-project-phase.js";
import {
  buildManageProjectTaskTool,
  PROJECTS_MANAGE_TASK_TOOL_ID,
} from "./tools/manage-project-task.js";

interface ProjectsAiOptions {
  invokeProjectsOperation: PluginServerGatewayCaller["invokeOperation"];
}

function defineProjectsAi(options: ProjectsAiOptions) {
  return defineModuleAi({
    dir: import.meta.url,
    moduleId: "projects",
    tools: {
      [PROJECTS_LOAD_PROJECT_TOOL_ID]: buildLoadProjectTool(
        options.invokeProjectsOperation
      ),
      [PROJECTS_LOAD_PROJECTS_LIST_TOOL_ID]: buildLoadProjectsListTool(
        options.invokeProjectsOperation
      ),
      [PROJECTS_LOAD_PROJECT_TASKS_TOOL_ID]: buildLoadProjectTasksTool(
        options.invokeProjectsOperation
      ),
      [PROJECTS_MANAGE_PROJECT_TOOL_ID]: buildManageProjectTool(
        options.invokeProjectsOperation
      ),
      [PROJECTS_MANAGE_PHASE_TOOL_ID]: buildManageProjectPhaseTool(
        options.invokeProjectsOperation
      ),
      [PROJECTS_MANAGE_TASK_TOOL_ID]: buildManageProjectTaskTool(
        options.invokeProjectsOperation
      ),
    },
  });
}

export function projectsAiRegistration(
  options: ProjectsAiOptions
): AiRegistration {
  return defineProjectsAi(options).aiRegistration();
}

export function projectsDynamicAiCapability(
  options: ProjectsAiOptions
): DynamicAiModuleCapability {
  return defineProjectsAi(options).dynamicCapability();
}
