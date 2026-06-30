import type { EngentyAgUiRouteContext } from "@engenty/ai-ui";
import type { Task } from "../../src/schema/types.js";
import { TASKS_ASSIST_AGENT_TYPE_KEY } from "./task-copilot-context.js";

/** Separate from the steady `engenty:copilot` host — one observe host per task. */
export function taskRunObserverStableSessionKey(taskId: string): string {
  return `task:run:${taskId}`;
}

export function taskRunObserverHostKey(taskId: string): string {
  return `task:run:${taskId}`;
}

function buildTaskRoutingScope(task: Task) {
  const titleHint = task.title?.trim() ?? "";
  return {
    current_module: "tasks",
    currentModule: "tasks",
    entityId: task.id,
    entity_id: task.id,
    goal_id: task.goal_id,
    task_id: task.id,
    task_identifier: task.identifier,
    ...(titleHint ? { task_title: titleHint } : {}),
  };
}

export function buildTaskRunObserverRouteContext(
  task: Task
): EngentyAgUiRouteContext {
  return {
    moduleId: "tasks",
    routeKey: "detail",
    scope: buildTaskRoutingScope(task),
  };
}

export function buildWorkOnTaskRunPrompt(task: Task): string {
  const title = task.title?.trim() || task.identifier;
  return `Work on task ${task.identifier} (${title}). Use the preloaded task context from Agent UI state and follow task-workflow checkout rules.`;
}

export const TASK_RUN_OBSERVER_AGENT_TYPE_KEY = TASKS_ASSIST_AGENT_TYPE_KEY;
