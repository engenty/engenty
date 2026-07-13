import {
  Button,
  type ColumnConfig,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  ListDisplayConfigurator,
  type ListPageSize,
  ListSearchInput,
  ListToolbarIconButton,
  ListViewModeToggle,
} from "@engenty/ui-core";
import {
  Calendar,
  ListFilter,
  ListTodo,
  MoreVertical,
  SlidersHorizontal,
  type SortOrder,
  type TableSize,
  User,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import type { ProjectListGroupBy } from "./project-list-filters.js";

export interface ProjectsColumnVisibility {
  client: boolean;
  endDate: boolean;
  startDate: boolean;
  tasks: boolean;
  team: boolean;
  title: boolean;
}

export type ProjectsSortColumn =
  | "title"
  | "start_date"
  | "end_date"
  | "created_at";

interface ProjectsTableToolbarProps {
  bulkActions?: ReactNode;
  clearSelectionLabel?: string;
  columnOrder: (keyof ProjectsColumnVisibility)[];
  columnVisibility: ProjectsColumnVisibility;
  filtersExpanded: boolean;
  filterToggleLabel: string;
  groupBy: ProjectListGroupBy;
  hasActiveChipFilters: boolean;
  labels: {
    searchPlaceholder: string;
    display: string;
    viewModeGroup: string;
    paginationSummary: string;
    selectedSummary: string;
    sortByTitle: string;
    sortByStartDate: string;
    sortByEndDate: string;
    sortByCreatedAt: string;
    ascending: string;
    descending: string;
    compactView: string;
    tableView: string;
    cardsView: string;
    sortBy: string;
    groupBy: string;
    groupByNone: string;
    groupByClient: string;
    groupByTimeframe: string;
    groupByLead: string;
    displayedColumns: string;
    hiddenInTable: string;
    showAll: string;
    hideAll: string;
    noColumnsDisplayed: string;
    toolbarMore: string;
    title: string;
    client: string;
    startDate: string;
    endDate: string;
    team: string;
    tasks: string;
    itemsPerPage: string;
  };
  onClearSelection?: () => void;
  onFiltersToggle: () => void;
  onGroupByChange: (value: ProjectListGroupBy) => void;
  onPageSizeChange: (value: ListPageSize) => void;
  onSearchChange: (value: string) => void;
  onSortByChange: (value: ProjectsSortColumn) => void;
  onSortOrderChange: (value: SortOrder) => void;
  pageSize: ListPageSize;
  searchQuery: string;
  selectedCount?: number;
  setColumnOrder: (order: (keyof ProjectsColumnVisibility)[]) => void;
  setColumnVisibility: (value: ProjectsColumnVisibility) => void;
  setTableSize: (size: TableSize) => void;
  setViewMode: (mode: ViewMode) => void;
  showTeamColumn?: boolean;
  sortBy: ProjectsSortColumn;
  sortOrder: SortOrder;
  tableSize: TableSize;
  totalCount: number;
  viewMode: ViewMode;
}

export function ProjectsTableToolbar(props: ProjectsTableToolbarProps) {
  const columns: ColumnConfig<keyof ProjectsColumnVisibility>[] = [
    { key: "title", label: props.labels.title, icon: User },
    { key: "client", label: props.labels.client, icon: User },
    { key: "startDate", label: props.labels.startDate, icon: Calendar },
    { key: "endDate", label: props.labels.endDate, icon: Calendar },
    { key: "tasks", label: props.labels.tasks, icon: ListTodo },
    { key: "team", label: props.labels.team, icon: User },
  ].filter((column) => props.showTeamColumn !== false || column.key !== "team");

  const sortOptions = [
    { value: "title" as ProjectsSortColumn, label: props.labels.sortByTitle },
    {
      value: "start_date" as ProjectsSortColumn,
      label: props.labels.sortByStartDate,
    },
    {
      value: "end_date" as ProjectsSortColumn,
      label: props.labels.sortByEndDate,
    },
    {
      value: "created_at" as ProjectsSortColumn,
      label: props.labels.sortByCreatedAt,
    },
  ];

  const groupByOptions: { value: ProjectListGroupBy; label: string }[] = [
    { value: "none", label: props.labels.groupByNone },
    { value: "client", label: props.labels.groupByClient },
    { value: "timeframe", label: props.labels.groupByTimeframe },
    { value: "lead", label: props.labels.groupByLead },
  ];

  const hasSelection = (props.selectedCount ?? 0) > 0;

  const renderDisplayMenu = (variant: "default" | "overflow-full") => (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {variant === "default" ? (
          <ListToolbarIconButton
            aria-label={props.labels.display}
            type="button"
          >
            <SlidersHorizontal />
          </ListToolbarIconButton>
        ) : (
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
        )}
      </DropdownMenuTrigger>
      <ListDisplayConfigurator<
        keyof ProjectsColumnVisibility,
        ProjectsSortColumn
      >
        columnOrder={props.columnOrder}
        columns={columns}
        columnVisibility={props.columnVisibility}
        groupBy={props.groupBy}
        groupByOptions={groupByOptions}
        labels={{
          table: props.labels.tableView,
          cards: props.labels.cardsView,
          compactView: props.labels.compactView,
          sortBy: props.labels.sortBy,
          groupBy: props.labels.groupBy,
          ascending: props.labels.ascending,
          descending: props.labels.descending,
          displayedInTable: props.labels.displayedColumns,
          hiddenInTable: props.labels.hiddenInTable,
          showAll: props.labels.showAll,
          hideAll: props.labels.hideAll,
          noColumnsDisplayed: props.labels.noColumnsDisplayed,
          itemsPerPage: props.labels.itemsPerPage,
        }}
        pageSize={props.pageSize}
        setColumnOrder={props.setColumnOrder}
        setColumnVisibility={props.setColumnVisibility}
        setGroupBy={(value) =>
          props.onGroupByChange(value as ProjectListGroupBy)
        }
        setPageSize={props.onPageSizeChange}
        setSortBy={props.onSortByChange}
        setSortOrder={props.onSortOrderChange}
        setTableSize={props.setTableSize}
        setViewMode={props.setViewMode}
        sortBy={props.sortBy}
        sortOptions={sortOptions}
        sortOrder={props.sortOrder}
        tableSize={props.tableSize}
        viewMode={props.viewMode}
      />
    </DropdownMenu>
  );

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2 sm:gap-3 md:flex-row md:items-center",
        hasSelection ? "md:flex-nowrap md:overflow-x-auto" : "md:flex-wrap"
      )}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
        <div className="relative w-full min-w-0 max-w-full sm:max-w-md md:max-w-lg lg:max-w-xl">
          <ListSearchInput
            className="w-full pr-10"
            onChange={(e) => props.onSearchChange(e.target.value)}
            placeholder={props.labels.searchPlaceholder}
            value={props.searchQuery}
            wrapperClassName="w-full"
          />
          <ListToolbarIconButton
            aria-label={props.filterToggleLabel}
            aria-pressed={props.filtersExpanded}
            className={cn(
              "absolute top-1/2 right-1 -translate-y-1/2",
              (props.filtersExpanded || props.hasActiveChipFilters) &&
                "text-foreground"
            )}
            onClick={props.onFiltersToggle}
            type="button"
          >
            <span className="relative inline-flex">
              <ListFilter className="h-4 w-4" />
              {props.hasActiveChipFilters ? (
                <span
                  aria-hidden
                  className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-primary"
                />
              ) : null}
            </span>
          </ListToolbarIconButton>
        </div>
        <p className="min-w-0 shrink-0 whitespace-nowrap text-muted-foreground text-xs tabular-nums">
          {hasSelection
            ? props.labels.selectedSummary
            : props.labels.paginationSummary}
        </p>
      </div>

      <div
        className={cn(
          "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 md:ml-auto md:shrink-0 md:justify-end",
          hasSelection
            ? "md:max-w-none md:flex-nowrap md:overflow-x-auto"
            : "md:max-w-[min(100%,42rem)]"
        )}
      >
        {hasSelection && (
          <>
            {props.bulkActions}
            <Button
              aria-label={props.clearSelectionLabel}
              className="shrink-0 gap-1"
              onClick={props.onClearSelection}
              size="sm"
              variant="ghost"
            >
              <X className="h-3.5 w-3.5" />
              {props.clearSelectionLabel}
            </Button>
          </>
        )}
        {hasSelection ? (
          <div className="flex shrink-0">
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <ListToolbarIconButton
                  aria-label={props.labels.toolbarMore}
                  type="button"
                >
                  <MoreVertical />
                </ListToolbarIconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-[min(22rem,calc(100vw-2rem))] p-2"
              >
                {renderDisplayMenu("overflow-full")}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <ListViewModeToggle
              labels={{
                cards: props.labels.cardsView,
                group: props.labels.viewModeGroup,
                table: props.labels.tableView,
              }}
              onChange={props.setViewMode}
              value={props.viewMode}
            />
            {renderDisplayMenu("default")}
          </div>
        )}
      </div>
    </div>
  );
}
