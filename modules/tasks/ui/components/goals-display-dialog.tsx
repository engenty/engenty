import { type ColumnConfig, ListDisplayConfigurator } from "@engenty/ui-core";
import { CalendarClock, CircleDot, ListTodo, Target } from "lucide-react";
import type { getGoalsToolbarLabels } from "../lib/goals-toolbar-labels.js";

export interface GoalsColumnVisibility {
  status: boolean;
  targetDate: boolean;
  tasks: boolean;
  title: boolean;
  updatedAt: boolean;
}

export type GoalsSortColumn = "updated_at" | "created_at" | "title" | "status";

export type GoalsViewMode = "cards" | "table";

export type TableSize = "compact" | "normal";
export type SortOrder = "asc" | "desc";

export interface GoalColumnOption {
  key: keyof GoalsColumnVisibility;
  label: string;
}

export interface GoalsDisplayDialogProps {
  columnOrder: (keyof GoalsColumnVisibility)[];
  columns: GoalColumnOption[];
  columnVisibility: GoalsColumnVisibility;
  labels: ReturnType<typeof getGoalsToolbarLabels>;
  setColumnOrder: (order: (keyof GoalsColumnVisibility)[]) => void;
  setColumnVisibility: (value: GoalsColumnVisibility) => void;
  setSortBy: (column: GoalsSortColumn) => void;
  setSortOrder: (order: SortOrder) => void;
  setTableSize?: (size: TableSize) => void;
  sortBy: GoalsSortColumn;
  sortOptions: { value: GoalsSortColumn; label: string }[];
  sortOrder: SortOrder;
  tableSize?: TableSize;
}

const COLUMN_ICONS: Record<
  keyof GoalsColumnVisibility,
  ColumnConfig<keyof GoalsColumnVisibility>["icon"]
> = {
  title: ListTodo,
  status: CircleDot,
  tasks: Target,
  targetDate: CalendarClock,
  updatedAt: CalendarClock,
};

export function GoalsDisplayDialog({
  columns,
  columnOrder,
  columnVisibility,
  labels,
  setColumnOrder,
  setColumnVisibility,
  setSortBy,
  setSortOrder,
  setTableSize,
  sortBy,
  sortOptions,
  sortOrder,
  tableSize,
}: GoalsDisplayDialogProps) {
  const columnConfigs: ColumnConfig<keyof GoalsColumnVisibility>[] =
    columns.map((col) => ({
      key: col.key,
      label: col.label,
      icon: COLUMN_ICONS[col.key] ?? ListTodo,
    }));

  return (
    <ListDisplayConfigurator<keyof GoalsColumnVisibility, GoalsSortColumn>
      columnOrder={columnOrder}
      columns={columnConfigs}
      columnVisibility={columnVisibility}
      labels={{
        table: labels.table,
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
      sortBy={sortBy}
      sortOptions={sortOptions}
      sortOrder={sortOrder}
      tableSize={tableSize}
      viewMode="table"
      viewModes={[]}
    />
  );
}
