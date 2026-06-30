/**
 * Projects copilot contribution: starter prompts and panel title on projects routes.
 */

import type { UiCopilotContribution } from "@engenty/ui-plugin-sdk";

export const projectsCopilotContribution: UiCopilotContribution = {
  moduleId: "projects",
  routeKey: "chat",
  title: "Projects",
  matches: (ctx) =>
    ctx.scope?.currentModule === "projects" &&
    ctx.scope?.routeKey !== "briefing",
  starterPrompts: [
    {
      id: "projects_summarize",
      label: "Summarize this project",
      prompt:
        "Summarize the current project: title, dates, client, phases, and open tasks. Use tools if needed.",
    },
    {
      id: "projects_tasks",
      label: "What tasks are open?",
      prompt:
        "List open or in-progress tasks for the current context. Use load_project or load_projects_list as needed.",
    },
    {
      id: "projects_compare",
      label: "Compare visible projects",
      prompt:
        "Based on the current project list context, highlight projects that match the list filter and suggest what to review next.",
    },
    {
      id: "projects_add_phase",
      label: "Add a phase to this project",
      prompt:
        "Create a new phase in the current project. Ask me for the phase title and dates if not already clear from context.",
    },
    {
      id: "projects_create_task",
      label: "Create a task in this project",
      prompt:
        "Create a new task in the current project. Ask me for the task title, phase, and assignees if not already clear from context.",
    },
    {
      id: "projects_portal_setup",
      label: "Set up client portal",
      prompt:
        "Help me configure the client portal for the current project — enable it, set a password, and choose which phases and tasks should be visible.",
    },
    {
      id: "projects_task_status",
      label: "Show task status breakdown",
      prompt:
        "Show a breakdown of tasks by status for the current project or across all projects if on the list page.",
    },
  ],
};
