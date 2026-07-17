"use client";

import { registerObjectWidget } from "@engenty/ai-ui";
import { TaskObjectCard } from "./components/copilot/task-object-card.js";
import { tasksPaths } from "./lib/tasks-routes.js";

const TASK_DETAIL_PATTERN =
  /^\/mdl\/tasks\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

let registered = false;

export function registerTasksObjectWidget() {
  if (registered) {
    return;
  }
  registered = true;

  registerObjectWidget({
    id: "tasks.task",
    module: "tasks",
    entity: "task",
    card: TaskObjectCard,
    getHref: (ref) => tasksPaths.taskDetail(ref.id),
    matchHref: (pathname) => {
      const match = pathname.match(TASK_DETAIL_PATTERN);
      return match ? { module: "tasks", entity: "task", id: match[1] } : null;
    },
  });
}
