import { ListDisplayConfigurator } from "@engenty/ui-core";
import type { getRoutinesToolbarLabels } from "../lib/routines-toolbar-labels.js";

export type RoutinesSortColumn = "name" | "last_run_at" | "enabled";
export type RoutinesEnabledFilter = "all" | "enabled" | "disabled";
export type SortOrder = "asc" | "desc";

export interface RoutinesDisplayDialogProps {
  labels: ReturnType<typeof getRoutinesToolbarLabels>;
  setSortBy: (column: RoutinesSortColumn) => void;
  setSortOrder: (order: SortOrder) => void;
  sortBy: RoutinesSortColumn;
  sortOptions: { value: RoutinesSortColumn; label: string }[];
  sortOrder: SortOrder;
}

export function RoutinesDisplayDialog({
  labels,
  setSortBy,
  setSortOrder,
  sortBy,
  sortOptions,
  sortOrder,
}: RoutinesDisplayDialogProps) {
  return (
    <ListDisplayConfigurator<string, RoutinesSortColumn>
      columnOrder={[]}
      columns={[]}
      columnVisibility={{}}
      labels={{
        table: labels.table,
        cards: labels.cards,
        sortBy: labels.sortBy,
        ascending: labels.ascending,
        descending: labels.descending,
        displayedInTable: labels.displayedColumns,
        hiddenInTable: labels.hiddenInTable,
        showAll: labels.showAll,
        hideAll: labels.hideAll,
        noColumnsDisplayed: labels.noColumnsDisplayed,
      }}
      setColumnOrder={() => undefined}
      setColumnVisibility={() => undefined}
      setSortBy={setSortBy}
      setSortOrder={setSortOrder}
      sortBy={sortBy}
      sortOptions={sortOptions}
      sortOrder={sortOrder}
      viewMode="cards"
      viewModes={[]}
    />
  );
}
