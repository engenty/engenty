import { useTranslation } from "@engenty/i18n/ui";
import {
  AdminListGroupHeader,
  AdminListGroupPill,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Checkbox,
  cn,
  DropdownMenuItem,
  DropdownMenuSeparator,
  STICKY_HEADER_CLASS,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowActions,
  TableSelectionCell,
  TableSelectionHeader,
} from "@engenty/ui-core";
import { Pencil, Trash2 } from "lucide-react";
import { Fragment, type ReactNode, useMemo, useState } from "react";
import type {
  Goal,
  Task,
  TaskStatusDefinition,
} from "../../src/schema/types.js";
import type { TasksListEnrichmentState } from "../hooks/use-tasks-list-enrichments.js";
import { TaskAssigneeLabel } from "./task-assignee-label.js";
import { TaskStatusBadge } from "./task-status-badge.js";
import type { TableSize } from "./tasks-display-dialog.js";
import type {
  TasksBuiltinColumnKey,
  TasksListColumnConfig,
} from "./tasks-list-columns.js";
import type { TasksGroupBy } from "./tasks-list-filter-bar.js";

interface TasksListTableProps {
  assigneeProfiles?: Map<string, { full_name: string; id: string }>;
  columnOrder: string[];
  columns: TasksListColumnConfig[];
  columnVisibility: Record<string, boolean>;
  enrichments: TasksListEnrichmentState;
  goals?: Goal[];
  groupBy?: TasksGroupBy;
  navigate: (to: string) => void;
  onDelete?: (taskId: string) => void | Promise<void>;
  onEdit?: (task: Task) => void;
  onRowClick: (task: Task) => void;
  onSelectAll: (checked: boolean | "indeterminate") => void;
  onSelectOne: (id: string, checked: boolean) => void;
  projectTitleById?: ReadonlyMap<string, string>;
  selectedIds: Set<string>;
  showAssignee?: boolean;
  tableSize?: TableSize;
  taskStatusDefinitions: TaskStatusDefinition[];
  tasks: Task[];
}

/** Per-group rows: bg-card cells, hover/selected wash, no inner dividers. */
const rowBodyBaseClass = cn(
  "[--ui-canvas-row-divider-w:0px]",
  "[&>tr:hover>td]:bg-muted/50 [&>tr>td]:bg-card",
  "[&>tr[data-state=selected]>td]:bg-muted/50"
);

/** Per-group card chrome — only when grouped (a flat list gets no card). */
const groupCardChromeClass = cn(
  "ui-canvas-raised rounded-md",
  "[&>tr:first-child>td:first-child]:rounded-tl-md",
  "[&>tr:first-child>td:last-child]:rounded-tr-md",
  "[&>tr:last-child>td:first-child]:rounded-bl-md",
  "[&>tr:last-child>td:last-child]:rounded-br-md"
);

const COLUMN_HEADERS: Record<TasksBuiltinColumnKey, string> = {
  identifier: "list.identifier",
  title: "list.titleColumn",
  assignee: "list.assignee",
  project: "list.project",
  status: "list.status",
  priority: "list.priority",
  dueDate: "list.dueDate",
  updatedAt: "list.updated",
};

const COLUMN_WIDTH_CLASS: Partial<Record<string, string>> = {
  identifier: "w-[100px]",
  title: "min-w-0 truncate",
  assignee: "w-[140px]",
  project: "w-[160px] min-w-[10rem] truncate",
  status: "w-[7rem] min-w-[7rem] max-w-[8.5rem] whitespace-nowrap",
  priority: "w-[5.5rem] min-w-[5.5rem] max-w-[7rem] whitespace-nowrap",
  dueDate: "w-[120px]",
  updatedAt: "w-[120px]",
};

interface TaskGroup {
  id: string;
  label: string;
  renderLabel?: () => ReactNode;
  tasks: Task[];
}

function formatDueDate(due: string | null): string {
  if (!due) {
    return "—";
  }
  return new Date(due).toLocaleDateString();
}

function isBuiltinColumnKey(key: string): key is TasksBuiltinColumnKey {
  return key in COLUMN_HEADERS;
}

function renderBuiltinCell(
  key: TasksBuiltinColumnKey,
  task: Task,
  taskStatusDefinitions: TaskStatusDefinition[],
  assigneeProfiles: Map<string, { full_name: string; id: string }> | undefined,
  projectTitleById: ReadonlyMap<string, string> | undefined,
  t: (key: string) => string
) {
  switch (key) {
    case "identifier":
      return (
        <TableCell
          className={cn("font-mono text-xs", COLUMN_WIDTH_CLASS.identifier)}
        >
          {task.identifier}
        </TableCell>
      );
    case "title":
      return (
        <TableCell className={cn("font-medium", COLUMN_WIDTH_CLASS.title)}>
          {task.title}
        </TableCell>
      );
    case "assignee":
      return (
        <TableCell className={COLUMN_WIDTH_CLASS.assignee}>
          <TaskAssigneeLabel assigneeProfiles={assigneeProfiles} task={task} />
        </TableCell>
      );
    case "project":
      return (
        <TableCell
          className={cn(
            "text-muted-foreground text-sm",
            COLUMN_WIDTH_CLASS.project
          )}
        >
          {task.project_id
            ? (projectTitleById?.get(task.project_id) ?? "—")
            : "—"}
        </TableCell>
      );
    case "status":
      return (
        <TableCell className={COLUMN_WIDTH_CLASS.status}>
          <TaskStatusBadge
            compact
            definitions={taskStatusDefinitions}
            status={task.status}
            task={task}
          />
        </TableCell>
      );
    case "priority":
      return (
        <TableCell
          className={cn(
            "text-muted-foreground text-sm",
            COLUMN_WIDTH_CLASS.priority
          )}
        >
          {t(`priority.${task.priority}`)}
        </TableCell>
      );
    case "dueDate":
      return (
        <TableCell
          className={cn(
            "text-muted-foreground text-sm",
            COLUMN_WIDTH_CLASS.dueDate
          )}
        >
          {formatDueDate(task.due_date)}
        </TableCell>
      );
    case "updatedAt":
      return (
        <TableCell
          className={cn(
            "text-muted-foreground text-sm",
            COLUMN_WIDTH_CLASS.updatedAt
          )}
        >
          {new Date(task.updated_at).toLocaleDateString()}
        </TableCell>
      );
    default:
      return null;
  }
}

export function TasksListTable({
  tasks,
  taskStatusDefinitions,
  onRowClick,
  onEdit,
  onDelete,
  onSelectAll,
  onSelectOne,
  selectedIds,
  columnVisibility,
  columnOrder,
  columns,
  assigneeProfiles,
  enrichments,
  navigate,
  showAssignee = true,
  tableSize = "normal",
  groupBy = "status",
  goals = [],
  projectTitleById,
}: TasksListTableProps) {
  const { t } = useTranslation("tasks");
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const showActions = Boolean(onEdit || onDelete);
  const compact = tableSize === "compact";

  const columnsByKey = useMemo(
    () => new Map(columns.map((column) => [column.key, column])),
    [columns]
  );

  const allSelected = tasks.length > 0 && selectedIds.size === tasks.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < tasks.length;

  const visibleColumns = useMemo(
    () =>
      columnOrder.filter((key) => {
        if (key === "assignee" && !showAssignee) {
          return false;
        }
        return columnVisibility[key] && columnsByKey.has(key);
      }),
    [columnOrder, columnVisibility, showAssignee, columnsByKey]
  );

  const renderCell = (key: string, task: Task) => {
    const column = columnsByKey.get(key);
    if (column?.renderCell) {
      return (
        <TableCell className={COLUMN_WIDTH_CLASS[key]}>
          {column.renderCell({
            task,
            enrichments: enrichments[task.id] ?? {},
            navigate,
          })}
        </TableCell>
      );
    }

    if (isBuiltinColumnKey(key)) {
      return renderBuiltinCell(
        key,
        task,
        taskStatusDefinitions,
        assigneeProfiles,
        projectTitleById,
        t
      );
    }

    return <TableCell>—</TableCell>;
  };

  const renderHeader = (key: string) => {
    const column = columnsByKey.get(key);
    if (column?.labelKey) {
      return t(column.labelKey.replace(/^tasks:/, ""));
    }
    if (isBuiltinColumnKey(key)) {
      return t(COLUMN_HEADERS[key]);
    }
    return column?.label ?? key;
  };

  const grouped = useMemo<TaskGroup[]>(() => {
    if (groupBy === "none") {
      return [{ id: "all", label: "", tasks }];
    }

    if (groupBy === "status") {
      const byStatus = new Map<string, Task[]>();
      const statusOrder = taskStatusDefinitions.map((d) => d.id);
      for (const id of statusOrder) {
        byStatus.set(id, []);
      }
      const fallback = statusOrder[0] ?? "todo";
      for (const task of tasks) {
        const key = statusOrder.includes(task.status) ? task.status : fallback;
        const list = byStatus.get(key) ?? [];
        list.push(task);
        byStatus.set(key, list);
      }
      return statusOrder
        .map((statusId) => {
          const def = taskStatusDefinitions.find((d) => d.id === statusId);
          return {
            id: statusId,
            label: def?.label ?? statusId,
            renderLabel: () => (
              <TaskStatusBadge
                compact
                definitions={taskStatusDefinitions}
                status={statusId}
              />
            ),
            tasks: byStatus.get(statusId) ?? [],
          };
        })
        .filter((g) => g.tasks.length > 0);
    }

    if (groupBy === "priority") {
      const priorityOrder = ["critical", "high", "medium", "low"] as const;
      const byPriority = new Map<string, Task[]>();
      for (const p of priorityOrder) {
        byPriority.set(p, []);
      }
      for (const task of tasks) {
        const p = task.priority ?? "medium";
        const list = byPriority.get(p) ?? [];
        list.push(task);
        byPriority.set(p, list);
      }
      return priorityOrder
        .map((priority) => ({
          id: priority,
          label: t(`priority.${priority}`, priority),
          tasks: byPriority.get(priority) ?? [],
        }))
        .filter((g) => g.tasks.length > 0);
    }

    if (groupBy === "assignee") {
      const byAssignee = new Map<string, Task[]>();
      for (const task of tasks) {
        let key = "unassigned";
        if (
          task.primary_assignee_kind === "user" &&
          task.primary_assignee_user_id
        ) {
          key = `user:${task.primary_assignee_user_id}`;
        } else if (
          task.primary_assignee_kind === "agent" &&
          task.primary_assignee_agent_type_key
        ) {
          key = `agent:${task.primary_assignee_agent_type_key}`;
        }
        const list = byAssignee.get(key) ?? [];
        list.push(task);
        byAssignee.set(key, list);
      }

      return Array.from(byAssignee.entries())
        .map(([key, groupTasks]) => {
          let label = t("sidebar.unassigned", "Unassigned");
          if (key.startsWith("user:")) {
            const userId = key.slice(5);
            label = assigneeProfiles?.get(userId)?.full_name ?? userId;
          } else if (key.startsWith("agent:")) {
            const agentKey = key.slice(6);
            label = `Agent: ${agentKey}`;
          }
          return { id: key, label, tasks: groupTasks };
        })
        .sort((a, b) => a.label.localeCompare(b.label));
    }

    if (groupBy === "goal") {
      const byGoal = new Map<string, Task[]>();
      for (const task of tasks) {
        const key = task.goal_id ?? "general";
        const list = byGoal.get(key) ?? [];
        list.push(task);
        byGoal.set(key, list);
      }
      return Array.from(byGoal.entries())
        .map(([key, groupTasks]) => {
          let label = t("list.generalTasks", "General tasks");
          if (key !== "general") {
            const g = goals.find((item) => item.id === key);
            label = g?.title ?? t("sidebar.missingGoal", "Unknown goal");
          }
          return { id: key, label, tasks: groupTasks };
        })
        .sort((a, b) => {
          if (a.id === "general") {
            return -1;
          }
          if (b.id === "general") {
            return 1;
          }
          return a.label.localeCompare(b.label);
        });
    }

    if (groupBy === "project") {
      const byProject = new Map<string, Task[]>();
      for (const task of tasks) {
        const key = task.project_id ?? "none";
        const list = byProject.get(key) ?? [];
        list.push(task);
        byProject.set(key, list);
      }
      return Array.from(byProject.entries())
        .map(([key, groupTasks]) => {
          let label = t("newTask.noProject", "No project");
          if (key !== "none") {
            label = projectTitleById?.get(key) ?? key;
          }
          return { id: key, label, tasks: groupTasks };
        })
        .sort((a, b) => {
          if (a.id === "none") {
            return 1;
          }
          if (b.id === "none") {
            return -1;
          }
          return a.label.localeCompare(b.label);
        });
    }

    return [{ id: "all", label: "", tasks }];
  }, [
    tasks,
    groupBy,
    taskStatusDefinitions,
    assigneeProfiles,
    goals,
    projectTitleById,
    t,
  ]);

  const getGroupSelectionState = (
    groupTasks: Task[]
  ): boolean | "indeterminate" => {
    if (groupTasks.length === 0) {
      return false;
    }
    const selectedCount = groupTasks.reduce(
      (count, task) => count + (selectedIds.has(task.id) ? 1 : 0),
      0
    );
    if (selectedCount === 0) {
      return false;
    }
    if (selectedCount === groupTasks.length) {
      return true;
    }
    return "indeterminate";
  };

  const handleSelectGroup = (
    groupTasks: Task[],
    checked: boolean | "indeterminate"
  ) => {
    const shouldSelect = checked === true || checked === "indeterminate";
    for (const task of groupTasks) {
      onSelectOne(task.id, shouldSelect);
    }
  };

  const handleDelete = async () => {
    if (!(deletingTask && onDelete)) {
      return;
    }
    setDeleting(true);
    try {
      await onDelete(deletingTask.id);
      setDeletingTask(null);
    } finally {
      setDeleting(false);
    }
  };

  if (visibleColumns.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("list.noColumnsDisplayed")}
      </p>
    );
  }

  const isGrouped = groupBy !== "none";
  const subheadlineColSpan = visibleColumns.length + 1 + (showActions ? 1 : 0);

  const renderTaskRow = (task: Task) => (
    <TableRow
      className={cn(
        "group cursor-pointer",
        compact ? "[&>td]:!py-1.5" : "[&>td]:!py-3"
      )}
      data-state={selectedIds.has(task.id) ? "selected" : undefined}
      key={task.id}
      onClick={() => onRowClick(task)}
    >
      <TableSelectionCell
        checked={selectedIds.has(task.id)}
        compact={compact}
        hoverReveal
        id={task.id}
        onCheckedChange={onSelectOne}
      />
      {visibleColumns.map((key) => (
        <Fragment key={key}>{renderCell(key, task)}</Fragment>
      ))}
      {showActions ? (
        <TableRowActions compact={compact}>
          {onEdit ? (
            <DropdownMenuItem
              onClick={(event) => {
                event.stopPropagation();
                onEdit(task);
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              {t("detail.edit")}
            </DropdownMenuItem>
          ) : null}
          {onEdit && onDelete ? <DropdownMenuSeparator /> : null}
          {onDelete ? (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={(event) => {
                event.stopPropagation();
                setDeletingTask(task);
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t("delete.action")}
            </DropdownMenuItem>
          ) : null}
        </TableRowActions>
      ) : null}
    </TableRow>
  );

  return (
    <>
      <Table className="mb-2" noWrapper>
        <TableHeader className={STICKY_HEADER_CLASS}>
          <TableRow
            className={cn(
              "group hover:bg-transparent",
              compact ? "[&>th]:!py-1.5" : "[&>th]:!py-3"
            )}
          >
            <TableSelectionHeader
              aria-label={t("selectAll", { defaultValue: "Select all" })}
              checked={
                someSelected && !allSelected ? "indeterminate" : allSelected
              }
              compact={compact}
              onCheckedChange={onSelectAll}
            />
            {visibleColumns.map((key) => (
              <TableHead className={COLUMN_WIDTH_CLASS[key]} key={key}>
                {renderHeader(key)}
              </TableHead>
            ))}
            {showActions ? <TableHead className="w-[40px] px-1" /> : null}
          </TableRow>
        </TableHeader>
        {isGrouped ? (
          grouped.map((group) => {
            const open = openSections[group.id] ?? true;
            return (
              <Fragment key={group.id}>
                <TableBody>
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      className="border-0 bg-transparent px-0 pt-4 pb-1"
                      colSpan={subheadlineColSpan}
                    >
                      <AdminListGroupHeader
                        count={t("list.groupCount", {
                          count: group.tasks.length,
                        })}
                        onToggle={() =>
                          setOpenSections((prev) => ({
                            ...prev,
                            [group.id]: !open,
                          }))
                        }
                        open={open}
                        selection={
                          <span className="flex w-[30px] justify-center">
                            <Checkbox
                              aria-label={t("list.selectGroup", {
                                defaultValue: "Select group",
                              })}
                              checked={getGroupSelectionState(group.tasks)}
                              onCheckedChange={(checked) =>
                                handleSelectGroup(group.tasks, checked)
                              }
                            />
                          </span>
                        }
                        toggleLabel={t("list.toggleGroup", {
                          defaultValue: "Toggle group",
                        })}
                      >
                        {group.renderLabel ? (
                          group.renderLabel()
                        ) : (
                          <AdminListGroupPill>{group.label}</AdminListGroupPill>
                        )}
                      </AdminListGroupHeader>
                    </TableCell>
                  </TableRow>
                </TableBody>
                {open ? (
                  <TableBody
                    className={cn(rowBodyBaseClass, groupCardChromeClass)}
                  >
                    {group.tasks.map(renderTaskRow)}
                  </TableBody>
                ) : null}
              </Fragment>
            );
          })
        ) : (
          <TableBody className={rowBodyBaseClass}>
            {tasks.map(renderTaskRow)}
          </TableBody>
        )}
      </Table>

      {onDelete ? (
        <AlertDialog
          onOpenChange={(open) => !open && setDeletingTask(null)}
          open={deletingTask !== null}
        >
          <AlertDialogContent onClick={(event) => event.stopPropagation()}>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("delete.confirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("delete.confirmDescription", {
                  title: deletingTask?.title ?? "",
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>
                {t("edit.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleting}
                onClick={() => void handleDelete()}
              >
                {t("delete.action")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  );
}
