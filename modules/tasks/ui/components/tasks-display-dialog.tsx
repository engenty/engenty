import { type ColumnConfig, ListDisplayConfigurator } from "@engenty/ui-core";
import {
  CalendarClock,
  CircleDot,
  Flag,
  ListTodo,
  Tag,
  User,
} from "lucide-react";
import type { getTasksToolbarLabels } from "../lib/tasks-toolbar-labels.js";

export interface TasksColumnVisibility {
  assignee: boolean;
  dueDate: boolean;
  identifier: boolean;
  priority: boolean;
  status: boolean;
  title: boolean;
  updatedAt: boolean;
}

export type TasksSortColumn =
  | "updated_at"
  | "created_at"
  | "title"
  | "status"
  | "identifier";

export type TasksViewMode = "table" | "kanban" | "cards";

export type TableSize = "compact" | "normal";
export type SortOrder = "asc" | "desc";

export interface TaskColumnOption {
  key: keyof TasksColumnVisibility;
  label: string;
}

export interface TasksDisplayDialogProps {
  columnOrder: (keyof TasksColumnVisibility)[];
  columns: TaskColumnOption[];
  columnVisibility: TasksColumnVisibility;
  labels: ReturnType<typeof getTasksToolbarLabels>;
  setColumnOrder: (order: (keyof TasksColumnVisibility)[]) => void;
  setColumnVisibility: (value: TasksColumnVisibility) => void;
  setSortBy: (column: TasksSortColumn) => void;
  setSortOrder: (order: SortOrder) => void;
  setTableSize?: (size: TableSize) => void;
  setViewMode: (mode: TasksViewMode) => void;
  sortBy: TasksSortColumn;
  sortOptions: { value: TasksSortColumn; label: string }[];
  sortOrder: SortOrder;
  tableSize?: TableSize;
  viewMode: TasksViewMode;
}

const COLUMN_ICONS: Record<
  keyof TasksColumnVisibility,
  ColumnConfig<keyof TasksColumnVisibility>["icon"]
> = {
  identifier: Tag,
  title: ListTodo,
  assignee: User,
  status: CircleDot,
  priority: Flag,
  dueDate: CalendarClock,
  updatedAt: CalendarClock,
};

export function TasksDisplayDialog({
  columns,
  columnOrder,
  columnVisibility,
  labels,
  setColumnOrder,
  setColumnVisibility,
  setSortBy,
  setSortOrder,
  setTableSize,
  setViewMode,
  sortBy,
  sortOptions,
  sortOrder,
  tableSize,
  viewMode,
}: TasksDisplayDialogProps) {
  const columnConfigs: ColumnConfig<keyof TasksColumnVisibility>[] =
    columns.map((col) => ({
      key: col.key,
      label: col.label,
      icon: COLUMN_ICONS[col.key] ?? ListTodo,
    }));

  return (
    <ListDisplayConfigurator<keyof TasksColumnVisibility, TasksSortColumn>
      columnOrder={columnOrder}
      columns={columnConfigs}
      columnVisibility={columnVisibility}
      labels={{
        table: labels.table,
        cards: labels.cards,
        kanban: labels.kanbanView,
        compactView: labels.compactView,
        sortBy: labels.sortBy,
        ascending: labels.ascending,
        descending: labels.descending,
        displayedInTable: labels.displayedColumns,
        hiddenInTable: labels.hiddenInTable,
        showAll: labels.showAll,
        hideAll: labels.hideAll,
        noColumnsDisplayed: labels.noColumnsDisplayed,
      }}
      setColumnOrder={setColumnOrder}
      setColumnVisibility={setColumnVisibility}
      setSortBy={setSortBy}
      setSortOrder={setSortOrder}
      setTableSize={setTableSize}
      setViewMode={setViewMode}
      sortBy={sortBy}
      sortOptions={sortOptions}
      sortOrder={sortOrder}
      tableSize={tableSize}
      viewMode={viewMode}
      viewModes={["table", "kanban", "cards"]}
    />
  );
}
