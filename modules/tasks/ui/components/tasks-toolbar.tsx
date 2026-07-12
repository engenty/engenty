import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuTrigger,
  ListIconSegmentToggle,
  ListSearchInput,
  ListToolbarIconButton,
} from "@engenty/ui-core";
import {
  Kanban,
  LayoutGrid,
  List,
  ListFilter,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { getTasksToolbarLabels } from "../lib/tasks-toolbar-labels.js";
import type {
  TableSize,
  TaskColumnOption,
  TasksColumnVisibility,
  TasksSortColumn,
  TasksViewMode,
} from "./tasks-display-dialog.js";
import { TasksDisplayDialog } from "./tasks-display-dialog.js";

interface TasksToolbarProps {
  bulkActions?: React.ReactNode;
  clearSelectionLabel?: string;
  columnOrder: string[];
  columns: TaskColumnOption[];
  columnVisibility: TasksColumnVisibility;
  filtersExpanded: boolean;
  hasActiveFilters: boolean;
  labels: ReturnType<typeof getTasksToolbarLabels>;
  onClearSelection?: () => void;
  onFiltersToggle: () => void;
  onSearchChange: (value: string) => void;
  searchQuery: string;
  selectedCount?: number;
  setColumnOrder: (order: string[]) => void;
  setColumnVisibility: (value: TasksColumnVisibility) => void;
  setSortBy: (column: TasksSortColumn) => void;
  setSortOrder: (order: "asc" | "desc") => void;
  setTableSize?: (size: TableSize) => void;
  setViewMode: (mode: TasksViewMode) => void;
  sortBy: TasksSortColumn;
  sortOptions: { value: TasksSortColumn; label: string }[];
  sortOrder: "asc" | "desc";
  tableSize?: TableSize;
  viewMode: TasksViewMode;
}

export function TasksToolbar({
  searchQuery,
  onSearchChange,
  labels,
  viewMode,
  setViewMode,
  tableSize,
  setTableSize,
  columnOrder,
  columnVisibility,
  setColumnOrder,
  setColumnVisibility,
  columns,
  sortBy,
  setSortBy,
  sortOptions,
  sortOrder,
  setSortOrder,
  filtersExpanded,
  onFiltersToggle,
  hasActiveFilters,
  bulkActions,
  selectedCount = 0,
  onClearSelection,
  clearSelectionLabel,
}: TasksToolbarProps) {
  const hasSelection = selectedCount > 0;

  return (
    <div className="flex min-w-0 flex-col gap-2 sm:gap-3 md:flex-row md:items-center">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
        <div
          className={cn(
            "relative w-full min-w-0 max-w-full",
            hasSelection
              ? "sm:max-w-xs md:max-w-[16rem]"
              : "sm:max-w-md md:max-w-lg lg:max-w-xl"
          )}
        >
          <ListSearchInput
            className="w-full pr-10"
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={labels.searchPlaceholder}
            value={searchQuery}
            wrapperClassName="w-full"
          />
          <ListToolbarIconButton
            aria-label="Toggle filters"
            aria-pressed={filtersExpanded}
            className={cn(
              "absolute top-1/2 right-1 -translate-y-1/2",
              (filtersExpanded || hasActiveFilters) && "text-foreground"
            )}
            onClick={onFiltersToggle}
            type="button"
          >
            <span className="relative inline-flex">
              <ListFilter className="h-4 w-4" />
              {hasActiveFilters ? (
                <span
                  aria-hidden
                  className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-primary"
                />
              ) : null}
            </span>
          </ListToolbarIconButton>
        </div>
        <p className="min-w-0 shrink-0 whitespace-nowrap text-muted-foreground text-xs tabular-nums">
          {hasSelection ? labels.selectedSummary : labels.paginationSummary}
        </p>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 md:ml-auto md:shrink-0 md:justify-end">
        {hasSelection && (
          <>
            {bulkActions}
            <Button
              aria-label={clearSelectionLabel}
              className="shrink-0 gap-1"
              onClick={onClearSelection}
              size="sm"
              variant="ghost"
            >
              <X className="h-3.5 w-3.5" />
              {clearSelectionLabel}
            </Button>
          </>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <ListIconSegmentToggle<TasksViewMode>
            onChange={(next) => {
              if (next !== "") {
                setViewMode(next);
              }
            }}
            segments={[
              { value: "table", label: labels.table, icon: List },
              { value: "kanban", label: labels.kanbanView, icon: Kanban },
              { value: "cards", label: labels.cards, icon: LayoutGrid },
            ]}
            value={viewMode}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <ListToolbarIconButton aria-label={labels.display} type="button">
                <SlidersHorizontal />
              </ListToolbarIconButton>
            </DropdownMenuTrigger>
            <TasksDisplayDialog
              columnOrder={columnOrder}
              columns={columns}
              columnVisibility={columnVisibility}
              labels={labels}
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
            />
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
