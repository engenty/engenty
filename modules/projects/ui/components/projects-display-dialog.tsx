import {
  Button,
  type ColumnConfig,
  DropdownMenu,
  DropdownMenuTrigger,
  ListDisplayConfigurator,
  type ListPageSize,
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
  ListViewModeToggle,
  type SortOrder,
  type TableSize,
  useListToolbar,
  type ViewMode,
} from "@engenty/ui-core";
import { Calendar, ListTodo, SlidersHorizontal, User } from "lucide-react";
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

function ProjectsDisplayMenu(props: {
  columnOrder: (keyof ProjectsColumnVisibility)[];
  columnVisibility: ProjectsColumnVisibility;
  columns: ColumnConfig<keyof ProjectsColumnVisibility>[];
  groupBy: ProjectListGroupBy;
  groupByOptions: { value: ProjectListGroupBy; label: string }[];
  labels: ProjectsTableToolbarProps["labels"];
  onGroupByChange: (value: ProjectListGroupBy) => void;
  onPageSizeChange: (value: ListPageSize) => void;
  onSortByChange: (value: ProjectsSortColumn) => void;
  onSortOrderChange: (value: SortOrder) => void;
  pageSize: ListPageSize;
  setColumnOrder: (order: (keyof ProjectsColumnVisibility)[]) => void;
  setColumnVisibility: (value: ProjectsColumnVisibility) => void;
  setTableSize: (size: TableSize) => void;
  setViewMode: (mode: ViewMode) => void;
  sortBy: ProjectsSortColumn;
  sortOptions: { value: ProjectsSortColumn; label: string }[];
  sortOrder: SortOrder;
  tableSize: TableSize;
  viewMode: ViewMode;
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
      <ListDisplayConfigurator<
        keyof ProjectsColumnVisibility,
        ProjectsSortColumn
      >
        columnOrder={props.columnOrder}
        columns={props.columns}
        columnVisibility={props.columnVisibility}
        groupBy={props.groupBy}
        groupByOptions={props.groupByOptions}
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
        sortOptions={props.sortOptions}
        sortOrder={props.sortOrder}
        tableSize={props.tableSize}
        viewMode={props.viewMode}
      />
    </DropdownMenu>
  );
}

export function ProjectsTableToolbar(props: ProjectsTableToolbarProps) {
  const allColumns: ColumnConfig<keyof ProjectsColumnVisibility>[] = [
    { key: "title", label: props.labels.title, icon: User },
    { key: "client", label: props.labels.client, icon: User },
    { key: "startDate", label: props.labels.startDate, icon: Calendar },
    { key: "endDate", label: props.labels.endDate, icon: Calendar },
    { key: "tasks", label: props.labels.tasks, icon: ListTodo },
    { key: "team", label: props.labels.team, icon: User },
  ];
  const columns = allColumns.filter(
    (column) => props.showTeamColumn !== false || column.key !== "team"
  );

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

  const selectedCount = props.selectedCount ?? 0;
  const hasSelection = selectedCount > 0;

  return (
    <ListToolbar selectedCount={selectedCount}>
      <ListToolbarMainArea>
        <ListToolbarSearch>
          <ListSearchInput
            className="w-full pr-10"
            onChange={(e) => props.onSearchChange(e.target.value)}
            onOpenFilters={() => {
              if (!props.filtersExpanded) {
                props.onFiltersToggle();
              }
            }}
            placeholder={props.labels.searchPlaceholder}
            value={props.searchQuery}
            wrapperClassName="w-full"
          />
          <ListToolbarFilterToggle
            active={props.filtersExpanded || props.hasActiveChipFilters}
            aria-label={props.filterToggleLabel}
            aria-pressed={props.filtersExpanded}
            onClick={props.onFiltersToggle}
            showDot={props.hasActiveChipFilters}
          />
        </ListToolbarSearch>
        <ListToolbarSummary>
          {hasSelection
            ? props.labels.selectedSummary
            : props.labels.paginationSummary}
        </ListToolbarSummary>
      </ListToolbarMainArea>

      <ListToolbarActions moreLabel={props.labels.toolbarMore}>
        <ListToolbarIdleControls>
          <ListViewModeToggle
            labels={{
              cards: props.labels.cardsView,
              group: props.labels.viewModeGroup,
              table: props.labels.tableView,
            }}
            onChange={props.setViewMode}
            value={props.viewMode}
          />
          <ListToolbarOverflowItem>
            <ProjectsDisplayMenu
              columnOrder={props.columnOrder}
              columns={columns}
              columnVisibility={props.columnVisibility}
              groupBy={props.groupBy}
              groupByOptions={groupByOptions}
              labels={props.labels}
              onGroupByChange={props.onGroupByChange}
              onPageSizeChange={props.onPageSizeChange}
              onSortByChange={props.onSortByChange}
              onSortOrderChange={props.onSortOrderChange}
              pageSize={props.pageSize}
              setColumnOrder={props.setColumnOrder}
              setColumnVisibility={props.setColumnVisibility}
              setTableSize={props.setTableSize}
              setViewMode={props.setViewMode}
              sortBy={props.sortBy}
              sortOptions={sortOptions}
              sortOrder={props.sortOrder}
              tableSize={props.tableSize}
              viewMode={props.viewMode}
            />
          </ListToolbarOverflowItem>
        </ListToolbarIdleControls>
        <ListToolbarBulkActions
          clearSelectionLabel={props.clearSelectionLabel ?? ""}
          onClearSelection={props.onClearSelection}
        >
          {props.bulkActions}
        </ListToolbarBulkActions>
      </ListToolbarActions>
    </ListToolbar>
  );
}
