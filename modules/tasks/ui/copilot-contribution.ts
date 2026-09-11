/**
 * Tasks copilot contribution: starter prompts and panel title on tasks routes.
 */

import type { UiCopilotContribution } from "@engenty/ui-plugin-sdk";

export const tasksCopilotContribution: UiCopilotContribution = {
  moduleId: "tasks",
  routeKey: "chat",
  title: "Tasks",
  matches: (ctx) => ctx.scope?.currentModule === "tasks" && !ctx.scope?.task_id,
  starterPrompts: [
    {
      id: "tasks_next_work",
      label: "What should I work on next?",
      prompt:
        "Based on the current tasks context, what should I work on next? Use the preloaded snapshot or tasks.list as needed.",
    },
    {
      id: "tasks_blocked",
      label: "Summarize blocked tasks",
      prompt:
        "Summarize blocked or stuck tasks in the visible list. Highlight what is blocking progress.",
    },
    {
      id: "tasks_summarize_task",
      label: "Summarize this task",
      prompt:
        "Summarize the current task: status, assignee, due date, and recent comments. Use the preloaded snapshot when available.",
    },
  ],
};

export const tasksDetailCopilotContribution: UiCopilotContribution = {
  moduleId: "tasks",
  routeKey: "detail",
  requestedAgentId: "tasks.assist",
  title: "Tasks",
  matches: (ctx) =>
    ctx.scope?.currentModule === "tasks" &&
    typeof ctx.scope?.task_id === "string",
  starterPrompts: [
    {
      id: "tasks_work_on_task",
      label: "Work on this task",
      prompt:
        "Help me work this task. Use the preloaded task snapshot, checkout when starting agent work, and follow the task lifecycle rules.",
    },
    {
      id: "tasks_summarize_task",
      label: "Summarize this task",
      prompt:
        "Summarize the current task: status, assignee, due date, and recent comments. Use the preloaded snapshot when available.",
    },
  ],
};

export const tasksBriefingCopilotContribution: UiCopilotContribution = {
  moduleId: "tasks",
  routeKey: "briefing",
  title: "Tasks briefing",
  matches: (ctx) =>
    ctx.scope?.currentModule === "tasks" && ctx.scope?.routeKey === "briefing",
  starterPrompts: [
    {
      id: "tasks_briefing_prioritize",
      label: "What should I prioritize?",
      prompt:
        "Using the briefing snapshot, suggest what I should prioritize today and what can wait.",
    },
    {
      id: "tasks_briefing_blocked",
      label: "What is blocked?",
      prompt:
        "From the briefing context, list blocked or waiting tasks and why they need attention.",
    },
    {
      id: "tasks_briefing_stale",
      label: "What went stale?",
      prompt:
        "Review stale items from the briefing snapshot and suggest follow-ups.",
    },
  ],
};
