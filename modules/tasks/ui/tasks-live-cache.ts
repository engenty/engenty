import type { LiveCacheBinding } from "@engenty/live-cache";
import { taskKeys } from "./tasks-queries.js";

export function createTaskDetailLiveBindings(
  taskId: string
): LiveCacheBinding[] {
  return [
    {
      id: "tasks_detail",
      postgresChanges: [
        { schema: "module_tasks", table: "tasks" },
        { schema: "module_tasks", table: "task_comments" },
        { schema: "module_tasks", table: "task_runs" },
        { schema: "module_tasks", table: "task_activity" },
      ],
      resolveQueryKeys: () => [
        taskKeys.detail(taskId),
        taskKeys.runs(taskId),
        taskKeys.activity(taskId),
      ],
    },
  ];
}
