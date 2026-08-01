import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuTrigger,
  ListFilterSelectTrigger,
  ListIconSegmentToggle,
  ListSearchInput,
  ListToolbarIconButton,
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@engenty/ui-core";
import {
  Bot,
  Kanban,
  List,
  ListFilter,
  Rows2,
  SlidersHorizontal,
  User,
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
import type { TasksGroupBy } from "./tasks-list-filter-bar.js";

export type TasksAssigneeKind = "user" | "agent" | "";

interface TasksToolbarProps {
  assigneeKind?: TasksAssigneeKind;
  bulkActions?: React.ReactNode;
  clearSelectionLabel?: string;
  columnOrder: string[];
  columns: TaskColumnOption[];
  columnVisibility: TasksColumnVisibility;
  filtersExpanded: boolean;
  groupBy: TasksGroupBy;
  groupByOptions: { value: TasksGroupBy; label: string }[];
  hasActiveFilters: boolean;
  labels: ReturnType<typeof getTasksToolbarLabels>;
  onAssigneeKindChange?: (kind: TasksAssigneeKind) => void;
  onClearSelection?: () => void;
  onFiltersToggle: () => void;
  onGroupByChange: (groupBy: TasksGroupBy) => void;
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
  assigneeKind = "",
  onAssigneeKindChange,
  searchQuery,
  onSearchChange,
  groupBy,
  groupByOptions,
  onGroupByChange,
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
  const selectedGroupByLabel =
    groupByOptions.find((option) => option.value === groupBy)?.label ?? groupBy;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {hasSelection ? (
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
      ) : null}

      <div className="relative shrink-0">
        <ListSearchInput
          className="max-w-[220px] pr-10"
          onChange={(e) => onSearchChange(e.target.value)}
          onOpenFilters={() => {
            if (!filtersExpanded) {
              onFiltersToggle();
            }
          }}
          placeholder={labels.searchPlaceholder}
          value={searchQuery}
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

      <Select
        onValueChange={(value) => onGroupByChange(value as TasksGroupBy)}
        value={groupBy}
      >
        <ListFilterSelectTrigger className="min-w-[10rem]">
          <SelectValue placeholder={selectedGroupByLabel}>
            {`${labels.groupBy}: ${selectedGroupByLabel}`}
          </SelectValue>
        </ListFilterSelectTrigger>
        <SelectContent>
          {groupByOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <p className="min-w-0 shrink-0 whitespace-nowrap text-muted-foreground text-xs tabular-nums">
        {hasSelection ? labels.selectedSummary : labels.paginationSummary}
      </p>

      {onAssigneeKindChange ? (
        <ListIconSegmentToggle<TasksAssigneeKind>
          allowDeselect
          aria-label={labels.filterByAssigneeKind}
          className="ml-auto shrink-0"
          onChange={(next) => onAssigneeKindChange(next)}
          segments={[
            { value: "user", label: labels.assigneeHuman, icon: User },
            { value: "agent", label: labels.assigneeAgent, icon: Bot },
          ]}
          value={assigneeKind}
        />
      ) : null}

      <ListIconSegmentToggle<TasksViewMode>
        className={onAssigneeKindChange ? "shrink-0" : "ml-auto shrink-0"}
        onChange={(next) => {
          if (next !== "") {
            setViewMode(next);
          }
        }}
        segments={[
          { value: "cards", label: labels.cards, icon: Rows2 },
          { value: "table", label: labels.table, icon: List },
          { value: "kanban", label: labels.kanbanView, icon: Kanban },
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
  );
}
