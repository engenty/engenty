import {
  CalendarClock,
  CircleDot,
  Flag,
  ListTodo,
  Tag,
  User,
} from "lucide-react";
import type { ComponentType } from "react";
import {
  getTasksListRegisteredColumns,
  type TasksListColumn,
} from "../list-hooks.js";
import type { TasksSortColumn } from "./tasks-display-dialog.js";

export type TasksBuiltinColumnKey =
  | "assignee"
  | "dueDate"
  | "identifier"
  | "priority"
  | "status"
  | "title"
  | "updatedAt";

export type TasksColumnKey = TasksBuiltinColumnKey | string;

export interface TasksListColumnConfig {
  defaultVisible?: boolean;
  icon?: ComponentType<{ className?: string }>;
  key: string;
  label: string;
  labelKey?: string;
  order: number;
  renderCell?: TasksListColumn["renderCell"];
}

const BUILTIN_COLUMNS: TasksListColumnConfig[] = [
  {
    key: "identifier",
    labelKey: "tasks:list.identifier",
    label: "ID",
    icon: Tag,
    order: 10,
    defaultVisible: true,
  },
  {
    key: "title",
    labelKey: "tasks:list.titleColumn",
    label: "Title",
    icon: ListTodo,
    order: 20,
    defaultVisible: true,
  },
  {
    key: "assignee",
    labelKey: "tasks:list.assignee",
    label: "Assignee",
    icon: User,
    order: 30,
    defaultVisible: true,
  },
  {
    key: "dueDate",
    labelKey: "tasks:list.dueDate",
    label: "Due",
    icon: CalendarClock,
    order: 40,
    defaultVisible: true,
  },
  {
    key: "status",
    labelKey: "tasks:list.status",
    label: "Status",
    icon: CircleDot,
    order: 50,
    defaultVisible: false,
  },
  {
    key: "priority",
    labelKey: "tasks:list.priority",
    label: "Priority",
    icon: Flag,
    order: 60,
    defaultVisible: false,
  },
  {
    key: "updatedAt",
    labelKey: "tasks:list.updated",
    label: "Updated",
    icon: CalendarClock,
    order: 70,
    defaultVisible: false,
  },
];

export function getTasksListColumns(): TasksListColumnConfig[] {
  const registeredColumns = getTasksListRegisteredColumns().map((column) => ({
    key: column.key,
    label: column.label,
    labelKey: column.labelKey,
    icon: column.icon,
    order: column.order ?? 100,
    defaultVisible: column.defaultVisible ?? true,
    renderCell: column.renderCell,
  }));

  return [...BUILTIN_COLUMNS, ...registeredColumns].sort(
    (left, right) => left.order - right.order
  );
}

export function createDefaultTasksColumnVisibility(): Record<string, boolean> {
  return Object.fromEntries(
    getTasksListColumns().map((column) => [
      column.key,
      column.defaultVisible ?? true,
    ])
  );
}

export function createDefaultTasksColumnOrder(): string[] {
  return getTasksListColumns().map((column) => column.key);
}

export function createTasksDisplayDefaults() {
  return {
    viewMode: "table" as const,
    tableSize: "normal" as const,
    sortBy: "updated_at" as TasksSortColumn,
    sortOrder: "desc" as const,
    columnVisibility: createDefaultTasksColumnVisibility(),
    columnOrder: createDefaultTasksColumnOrder(),
  };
}
