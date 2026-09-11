/**
 * Tasks' own tab on the work overview: every task across the viewer's spaces.
 */
import { useTranslation } from "@engenty/i18n/ui";
import type { Task } from "../src/schema/types.js";
import { getTasks } from "./api.js";
import { TaskStatusBadge } from "./components/task-status-badge.js";
import { tasksPathsForSpace } from "./lib/tasks-routes.js";
import { formatWorkDate, type WorkTab } from "./work-tabs.js";

/** The list route's page maximum. */
const PAGE_SIZE = 200;

function TaskPriorityLabel({ priority }: { priority: Task["priority"] }) {
  const { t } = useTranslation("tasks");
  return <>{t(`priority.${priority}`, { defaultValue: priority })}</>;
}

export const tasksWorkTab: WorkTab<Task> = {
  columns: [
    {
      className: "w-28 text-muted-foreground text-xs tabular-nums",
      key: "identifier",
      label: "ID",
      labelKey: "tasks:work.columns.identifier",
      render: (task) => task.identifier,
    },
    {
      className: "max-w-0 truncate",
      key: "title",
      label: "Title",
      labelKey: "tasks:work.columns.title",
      link: true,
      render: (task) => task.title,
    },
    {
      className: "w-32",
      key: "status",
      label: "Status",
      labelKey: "tasks:work.columns.status",
      render: (task) => <TaskStatusBadge compact status={task.status} />,
    },
    {
      className: "w-28 text-xs",
      key: "priority",
      label: "Priority",
      labelKey: "tasks:work.columns.priority",
      render: (task) => <TaskPriorityLabel priority={task.priority} />,
    },
    {
      className: "w-32 text-xs",
      key: "due",
      label: "Due",
      labelKey: "tasks:work.columns.due",
      render: (task) => formatWorkDate(task.due_date),
    },
    {
      className: "w-32 text-muted-foreground text-xs",
      key: "updated",
      label: "Updated",
      labelKey: "tasks:work.columns.updated",
      render: (task) => formatWorkDate(task.updated_at),
    },
  ],
  href: (task, spaceKey) => tasksPathsForSpace(spaceKey).taskDetail(task.id),
  id: "tasks",
  label: "Tasks",
  labelKey: "tasks:work.tab",
  load: async ({ mine, spaceId }, signal) => {
    const page = await getTasks(
      {
        pageSize: PAGE_SIZE,
        sortBy: "updated_at",
        sortOrder: "desc",
        ...(mine ? { scope: "mine" as const } : {}),
        ...(spaceId ? { space_id: spaceId } : {}),
      },
      signal
    );
    return { rows: page.data, total: page.total };
  },
  order: 10,
  rowKey: (task) => task.id,
  spaceIdOf: (task) => task.space_id,
  statusOf: (task) => task.status,
  supportsMine: true,
};
