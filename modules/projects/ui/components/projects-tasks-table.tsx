import { useTranslation } from "@engenty/i18n/ui";
import {
  AvatarStack,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  STICKY_HEADER_CLASS,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowActions,
  TableSortableHeader,
} from "@engenty/ui-core";
import { ExternalLink, Pencil } from "lucide-react";
import { Link } from "react-router-dom";
import type {
  ProjectTaskListItem,
  ProjectTaskStatusDefinition,
} from "../api.js";
import type {
  ProjectsTasksColumnVisibility,
  ProjectsTasksSortColumn,
} from "./projects-tasks-display-dialog.js";
import { TaskStatusBadge } from "./task-status-badge.js";

type TableSize = "compact" | "normal";

const COLUMN_TO_SORT: Partial<
  Record<keyof ProjectsTasksColumnVisibility, ProjectsTasksSortColumn>
> = {
  title: "title",
  status: "status",
  updatedAt: "updated_at",
};

function formatRelativeTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 60) {
    return diffMins <= 1 ? "just now" : `${diffMins}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return d.toLocaleDateString();
}

interface ProjectsTasksTableProps {
  columnOrder: (keyof ProjectsTasksColumnVisibility)[];
  columnVisibility: ProjectsTasksColumnVisibility;
  onEditTask: (task: ProjectTaskListItem) => void;
  onRowClick: (task: ProjectTaskListItem) => void;
  onSortChange: (column: ProjectsTasksSortColumn) => void;
  onStatusChange: (task: ProjectTaskListItem, status: string) => void;
  onViewProject: (task: ProjectTaskListItem) => void;
  showAssignees?: boolean;
  sortBy: ProjectsTasksSortColumn;
  sortOrder: "asc" | "desc";
  tableSize: TableSize;
  taskStatusDefinitions: ProjectTaskStatusDefinition[];
  tasks: ProjectTaskListItem[];
}

export function ProjectsTasksTable({
  tasks,
  columnVisibility,
  columnOrder,
  sortBy,
  sortOrder,
  tableSize,
  onSortChange,
  onRowClick,
  onViewProject,
  onEditTask,
  onStatusChange,
  showAssignees = true,
  taskStatusDefinitions,
}: ProjectsTasksTableProps) {
  const { t } = useTranslation("projects");

  const labels: Record<keyof ProjectsTasksColumnVisibility, string> = {
    title: t("tasks.columns.title"),
    project: t("tasks.columns.project"),
    phase: t("tasks.columns.phase"),
    assignees: t("tasks.columns.assignees"),
    status: t("tasks.columns.status"),
    hours: t("tasks.columns.hours"),
    updatedAt: t("tasks.columns.updatedAt"),
  };

  const compact = tableSize === "compact";

  const renderCell = (
    key: keyof ProjectsTasksColumnVisibility,
    task: ProjectTaskListItem
  ) => {
    switch (key) {
      case "title":
        return task.title;
      case "project":
        return (
          <Link
            className="underline-offset-2 hover:underline"
            onClick={(e) => e.stopPropagation()}
            to={`/mdl/projects/${task.project_id}`}
          >
            {task.project_title || "—"}
          </Link>
        );
      case "phase":
        return task.phase_title ?? t("tasks.general");
      case "assignees": {
        if (!showAssignees) {
          return "—";
        }
        const members = task.task_team ?? [];
        if (members.length === 0) {
          return "—";
        }
        const profiles = members.map((m) => ({
          id: m.user_id,
          full_name: m.profile?.full_name ?? m.user_id.slice(0, 8),
          avatar_url: m.profile?.avatar_url ?? null,
          is_connected: m.profile?.is_connected ?? true,
        }));
        return <AvatarStack max={4} profiles={profiles} size="sm" />;
      }
      case "status":
        return (
          <TaskStatusBadge
            compact={compact}
            definitions={taskStatusDefinitions}
            status={task.status}
          />
        );
      case "hours":
        return task.hours == null ? "—" : `${task.hours}h`;
      case "updatedAt":
        return formatRelativeTime(task.updated_at);
      default:
        return "—";
    }
  };

  return (
    <Table noWrapper>
      <TableHeader className={STICKY_HEADER_CLASS}>
        <TableRow
          className={`group border-b-0 hover:bg-transparent ${compact ? "[&>th]:!py-1.5" : "[&>th]:!py-3"}`}
        >
          {columnOrder.map((key) => {
            if (!columnVisibility[key]) {
              return null;
            }
            const sortColumn = COLUMN_TO_SORT[key];
            if (sortColumn) {
              return (
                <TableSortableHeader<ProjectsTasksSortColumn>
                  column={sortColumn}
                  compact={compact}
                  key={key}
                  onSort={onSortChange}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                >
                  {labels[key]}
                </TableSortableHeader>
              );
            }
            return (
              <TableHead className={compact ? "!py-1.5 h-8" : ""} key={key}>
                {labels[key]}
              </TableHead>
            );
          })}
          <TableHead
            className={`w-[40px] px-1 ${compact ? "!py-1.5 h-8" : ""}`}
          />
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((task) => (
          <TableRow
            className={`group cursor-pointer ${compact ? "[&>td]:!py-1.5" : "[&>td]:!py-3"}`}
            key={task.id}
            onClick={() => onRowClick(task)}
          >
            {columnOrder.map((key) => {
              if (!columnVisibility[key]) {
                return null;
              }
              return (
                <TableCell
                  className={key === "title" ? "font-medium" : ""}
                  key={key}
                >
                  {renderCell(key, task)}
                </TableCell>
              );
            })}
            <TableRowActions compact={compact}>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onEditTask(task);
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                {t("detail.edit")}
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger onClick={(e) => e.stopPropagation()}>
                  {t("tasks.columns.status")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {taskStatusDefinitions.map((def) => (
                    <DropdownMenuItem
                      key={def.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (task.status !== def.id) {
                          onStatusChange(task, def.id);
                        }
                      }}
                    >
                      {def.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onViewProject(task);
                }}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                {t("tasks.viewProject")}
              </DropdownMenuItem>
            </TableRowActions>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
