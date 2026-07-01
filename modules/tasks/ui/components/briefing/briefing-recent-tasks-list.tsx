import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { Link } from "react-router-dom";
import type { Task, TaskStatusDefinition } from "../../../src/schema/types.js";
import { formatActivityTimeLabel } from "../../lib/format-activity-time.js";
import { tasksPaths } from "../../lib/tasks-routes.js";
import { TaskAssigneeLabel } from "../task-assignee-label.js";
import { TaskStatusBadge } from "../task-status-badge.js";

interface BriefingRecentTasksListProps {
  emptyLabel: string;
  taskStatusDefinitions: TaskStatusDefinition[];
  tasks: Task[];
  title: string;
}

export function BriefingRecentTasksList({
  emptyLabel,
  taskStatusDefinitions,
  tasks,
  title,
}: BriefingRecentTasksListProps) {
  const { t } = useTranslation("tasks");

  return (
    <div className="min-w-0">
      <h3 className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
        {title}
      </h3>
      {tasks.length === 0 ? (
        <div className="rounded-lg border border-border p-4">
          <p className="text-muted-foreground text-sm">{emptyLabel}</p>
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {tasks.map((task) => (
            <Link
              className="block px-4 py-3 text-sm transition-colors hover:bg-accent/50"
              key={task.id}
              to={tasksPaths.taskDetail(task.id)}
            >
              <div className="flex items-start gap-2 sm:items-center sm:gap-3">
                <div className="min-w-0 flex-1 space-y-1 sm:space-y-0">
                  <p className="line-clamp-2 font-medium sm:truncate">
                    {task.title}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                    <span className="font-mono">{task.identifier}</span>
                    <TaskStatusBadge
                      compact
                      definitions={taskStatusDefinitions}
                      status={task.status}
                    />
                    <TaskAssigneeLabel className="text-xs" task={task} />
                    <span className={cn("shrink-0")}>
                      {formatActivityTimeLabel(task.updated_at, t)}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
