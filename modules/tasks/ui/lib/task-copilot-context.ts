import { useMemo } from "react";
import type { Task } from "../../src/schema/types.js";

export const TASKS_ASSIST_AGENT_TYPE_KEY = "tasks.assist";

type TaskCopilotContextOverride = {
  moduleId?: string;
  pathname?: string;
  routeKey?: string;
  scope: Record<string, unknown>;
} | null;

/** Routing and launch scope only — preloads live in Agent UI state slices. */
function buildTaskRoutingScope(task: Task) {
  const titleHint = task.title?.trim() ?? "";
  return {
    current_module: "tasks",
    currentModule: "tasks",
    entityId: task.id,
    entity_id: task.id,
    task_id: task.id,
    task_identifier: task.identifier,
    ...(titleHint ? { task_title: titleHint } : {}),
  };
}

export function buildTaskDetailCopilotContext(
  task: Task
): NonNullable<TaskCopilotContextOverride> {
  return {
    moduleId: "tasks",
    routeKey: "detail",
    scope: buildTaskRoutingScope(task),
  };
}

/** Stable task-detail copilot override — avoids re-setting shell scope every render. */
export function useTaskDetailCopilotContextOverride(
  task: Task | null
): TaskCopilotContextOverride {
  return useMemo(() => {
    if (!task) {
      return null;
    }
    return buildTaskDetailCopilotContext(task);
  }, [task?.id, task?.identifier, task?.title]);
}
