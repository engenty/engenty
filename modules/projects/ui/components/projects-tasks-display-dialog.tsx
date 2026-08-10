import { type ColumnConfig, ListDisplayConfigurator } from "@engenty/ui-core";
import {
  CalendarClock,
  CircleDot,
  Clock,
  FolderOpen,
  Layers,
  ListTodo,
  Users,
} from "lucide-react";
import type { getProjectsTasksToolbarLabels } from "../lib/projects-tasks-toolbar-labels.js";

export interface ProjectsTasksColumnVisibility {
  assignees: boolean;
  hours: boolean;
  phase: boolean;
  project: boolean;
  status: boolean;
  title: boolean;
  updatedAt: boolean;
}

export type ProjectsTasksSortColumn =
  | "updated_at"
  | "created_at"
  | "title"
  | "status";

export type ProjectsTasksViewMode = "table" | "kanban";

export type TableSize = "compact" | "normal";
export type SortOrder = "asc" | "desc";

export interface TaskColumnOption {
  key: keyof ProjectsTasksColumnVisibility;
  label: string;
}

export interface ProjectsTasksDisplayDialogProps {
  columnOrder: (keyof ProjectsTasksColumnVisibility)[];
  columns: TaskColumnOption[];
  columnVisibility: ProjectsTasksColumnVisibility;
  labels: ReturnType<typeof getProjectsTasksToolbarLabels>;
  setColumnOrder: (order: (keyof ProjectsTasksColumnVisibility)[]) => void;
  setColumnVisibility: (value: ProjectsTasksColumnVisibility) => void;
  setSortBy: (column: ProjectsTasksSortColumn) => void;
  setSortOrder: (order: SortOrder) => void;
  setTableSize?: (size: TableSize) => void;
  setViewMode: (mode: ProjectsTasksViewMode) => void;
  sortBy: ProjectsTasksSortColumn;
  sortOptions: { value: ProjectsTasksSortColumn; label: string }[];
  sortOrder: SortOrder;
  tableSize?: TableSize;
  viewMode: ProjectsTasksViewMode;
}

const COLUMN_ICONS: Record<
  keyof ProjectsTasksColumnVisibility,
  ColumnConfig<keyof ProjectsTasksColumnVisibility>["icon"]
> = {
  title: ListTodo,
  project: FolderOpen,
  phase: Layers,
  assignees: Users,
  status: CircleDot,
  hours: Clock,
  updatedAt: CalendarClock,
};

export function ProjectsTasksDisplayDialog({
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
}: ProjectsTasksDisplayDialogProps) {
  const columnConfigs: ColumnConfig<keyof ProjectsTasksColumnVisibility>[] =
    columns.map((col) => ({
      key: col.key,
      label: col.label,
      icon: COLUMN_ICONS[col.key] ?? ListTodo,
    }));

  return (
    <ListDisplayConfigurator<
      keyof ProjectsTasksColumnVisibility,
      ProjectsTasksSortColumn
    >
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
      setViewMode={(mode) => {
        // viewModes below restricts the configurator to these two modes.
        if (mode === "table" || mode === "kanban") {
          setViewMode(mode);
        }
      }}
      sortBy={sortBy}
      sortOptions={sortOptions}
      sortOrder={sortOrder}
      tableSize={tableSize}
      viewMode={viewMode}
      viewModes={["table", "kanban"]}
    />
  );
}
