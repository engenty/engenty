import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  ListFilterSelectTrigger,
  ListIconSegmentToggle,
  ListSearchInput,
  ListToolbar,
  ListToolbarActions,
  ListToolbarBulkActions,
  ListToolbarFilterToggle,
  ListToolbarIconButton,
  ListToolbarIdleControls,
  ListToolbarMainArea,
  ListToolbarOverflowItem,
  ListToolbarSearch,
  ListToolbarSummary,
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
  useListToolbar,
} from "@engenty/ui-core";
import {
  Bot,
  Kanban,
  List,
  Rows2,
  SlidersHorizontal,
  User,
  Workflow,
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

/**
 * Who is doing the work. `runs` is not an assignee kind at all — it is the
 * machine-run filter (work a run drives rather than a person), which belongs
 * in the same toggle because it answers the same question a reader is asking.
 */
export type TasksAssigneeKind = "user" | "agent" | "runs" | "";

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

function TasksDisplayMenu(props: {
  columnOrder: string[];
  columns: TaskColumnOption[];
  columnVisibility: TasksColumnVisibility;
  labels: ReturnType<typeof getTasksToolbarLabels>;
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
}) {
  const { overflowPlacement } = useListToolbar();
  const inMenu = overflowPlacement === "menu";

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {inMenu ? (
          <Button
            aria-label={props.labels.display}
            className="h-9 w-full justify-start gap-1.5"
            size="sm"
            type="button"
            variant="ghost"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {props.labels.display}
          </Button>
        ) : (
          <ListToolbarIconButton
            aria-label={props.labels.display}
            type="button"
          >
            <SlidersHorizontal />
          </ListToolbarIconButton>
        )}
      </DropdownMenuTrigger>
      <TasksDisplayDialog
        columnOrder={props.columnOrder}
        columns={props.columns}
        columnVisibility={props.columnVisibility}
        labels={props.labels}
        setColumnOrder={props.setColumnOrder}
        setColumnVisibility={props.setColumnVisibility}
        setSortBy={props.setSortBy}
        setSortOrder={props.setSortOrder}
        setTableSize={props.setTableSize}
        setViewMode={props.setViewMode}
        sortBy={props.sortBy}
        sortOptions={props.sortOptions}
        sortOrder={props.sortOrder}
        tableSize={props.tableSize}
        viewMode={props.viewMode}
      />
    </DropdownMenu>
  );
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
    <ListToolbar selectedCount={selectedCount}>
      <ListToolbarMainArea>
        <ListToolbarSearch>
          <ListSearchInput
            className="w-full pr-10"
            onChange={(e) => onSearchChange(e.target.value)}
            onOpenFilters={() => {
              if (!filtersExpanded) {
                onFiltersToggle();
              }
            }}
            placeholder={labels.searchPlaceholder}
            value={searchQuery}
            wrapperClassName="w-full"
          />
          <ListToolbarFilterToggle
            active={filtersExpanded || hasActiveFilters}
            aria-label="Toggle filters"
            aria-pressed={filtersExpanded}
            onClick={onFiltersToggle}
            showDot={hasActiveFilters}
          />
        </ListToolbarSearch>
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-muted-foreground text-xs">
            {labels.groupedByLabel}
          </span>
          <Select
            onValueChange={(value) => onGroupByChange(value as TasksGroupBy)}
            value={groupBy}
          >
            <ListFilterSelectTrigger
              aria-label={labels.groupedByLabel}
              className="min-w-[7rem]"
            >
              <SelectValue placeholder={selectedGroupByLabel}>
                {selectedGroupByLabel}
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
        </div>
        {onAssigneeKindChange ? (
          <ListIconSegmentToggle<TasksAssigneeKind>
            allowDeselect
            aria-label={labels.filterByAssigneeKind}
            className="shrink-0"
            onChange={(next) => onAssigneeKindChange(next)}
            segments={[
              { value: "user", label: labels.assigneeHuman, icon: User },
              { value: "agent", label: labels.assigneeAgent, icon: Bot },
              { value: "runs", label: labels.assigneeRuns, icon: Workflow },
            ]}
            value={assigneeKind}
          />
        ) : null}
        <ListToolbarSummary>
          {hasSelection ? labels.selectedSummary : labels.paginationSummary}
        </ListToolbarSummary>
      </ListToolbarMainArea>

      <ListToolbarActions moreLabel="More">
        <ListToolbarIdleControls>
          <ListIconSegmentToggle<TasksViewMode>
            className="shrink-0"
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
          <ListToolbarOverflowItem>
            <TasksDisplayMenu
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
          </ListToolbarOverflowItem>
        </ListToolbarIdleControls>
        <ListToolbarBulkActions
          clearSelectionLabel={clearSelectionLabel ?? ""}
          onClearSelection={onClearSelection}
        >
          {bulkActions}
        </ListToolbarBulkActions>
      </ListToolbarActions>
    </ListToolbar>
  );
}
