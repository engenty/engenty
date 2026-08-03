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
import {
  Briefcase,
  MapPin,
  Phone,
  SlidersHorizontal,
  User,
  UserCircle,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { teamMembersDisplayColumnsForViewMode } from "../lib/team-members-card-fields.js";
import type { TeamListGroupBy } from "./team-list-filters.js";

export interface TeamMembersColumnVisibility {
  avatar: boolean;
  department: boolean;
  fullName: boolean;
  linkedUser: boolean;
  location: boolean;
  phone: boolean;
  position: boolean;
  reportsTo: boolean;
}

export type TeamMembersSortColumn =
  | "full_name"
  | "position"
  | "department"
  | "created_at";

interface TeamMembersTableToolbarProps {
  bulkActions?: ReactNode;
  clearSelectionLabel?: string;
  columnOrder: (keyof TeamMembersColumnVisibility)[];
  columnVisibility: TeamMembersColumnVisibility;
  /** Icon-only display trigger + quick list/cards toggle (default). */
  displayVariant?: "compact" | "labeled";
  filtersExpanded: boolean;
  filterToggleLabel: string;
  groupBy: TeamListGroupBy;
  hasActiveChipFilters: boolean;
  labels: {
    searchPlaceholder: string;
    display: string;
    viewModeGroup: string;
    paginationSummary: string;
    selectedSummary: string;
    sortByName: string;
    sortByPosition: string;
    sortByDepartment: string;
    sortByCreatedAt: string;
    ascending: string;
    descending: string;
    compactView: string;
    tableView: string;
    cardsView: string;
    sortBy: string;
    groupBy: string;
    groupByNone: string;
    groupByDepartment: string;
    groupByRole: string;
    groupByLocation: string;
    displayedColumns: string;
    hiddenInTable: string;
    showAll: string;
    hideAll: string;
    noColumnsDisplayed: string;
    toolbarMore: string;
    avatar: string;
    fullName: string;
    position: string;
    department: string;
    location: string;
    phone: string;
    linkedUser: string;
    reportsTo: string;
    itemsPerPage: string;
  };
  onClearSelection?: () => void;
  onFiltersToggle: () => void;
  onGroupByChange: (value: TeamListGroupBy) => void;
  onPageSizeChange: (value: ListPageSize) => void;
  onSearchChange: (value: string) => void;
  onSortByChange: (value: TeamMembersSortColumn) => void;
  onSortOrderChange: (value: SortOrder) => void;
  pageSize: ListPageSize;
  searchQuery: string;
  selectedCount?: number;
  setColumnOrder: (order: (keyof TeamMembersColumnVisibility)[]) => void;
  setColumnVisibility: (value: TeamMembersColumnVisibility) => void;
  setTableSize: (size: TableSize) => void;
  setViewMode: (mode: ViewMode) => void;
  sortBy: TeamMembersSortColumn;
  sortOrder: SortOrder;
  tableSize: TableSize;
  totalCount: number;
  viewMode: ViewMode;
}

function TeamMembersDisplayMenu(props: {
  columnOrder: (keyof TeamMembersColumnVisibility)[];
  columnVisibility: TeamMembersColumnVisibility;
  columns: ColumnConfig<keyof TeamMembersColumnVisibility>[];
  displayVariant: "compact" | "labeled";
  groupBy: TeamListGroupBy;
  groupByOptions: { value: TeamListGroupBy; label: string }[];
  labels: TeamMembersTableToolbarProps["labels"];
  onGroupByChange: (value: TeamListGroupBy) => void;
  onPageSizeChange: (value: ListPageSize) => void;
  onSortByChange: (value: TeamMembersSortColumn) => void;
  onSortOrderChange: (value: SortOrder) => void;
  pageSize: ListPageSize;
  setColumnOrder: (order: (keyof TeamMembersColumnVisibility)[]) => void;
  setColumnVisibility: (value: TeamMembersColumnVisibility) => void;
  setTableSize: (size: TableSize) => void;
  setViewMode: (mode: ViewMode) => void;
  sortBy: TeamMembersSortColumn;
  sortOptions: { value: TeamMembersSortColumn; label: string }[];
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
        ) : props.displayVariant === "compact" ? (
          <ListToolbarIconButton
            aria-label={props.labels.display}
            type="button"
          >
            <SlidersHorizontal />
          </ListToolbarIconButton>
        ) : (
          <Button
            aria-label={props.labels.display}
            className="gap-1.5"
            size="sm"
            type="button"
            variant="outline"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {props.labels.display}
          </Button>
        )}
      </DropdownMenuTrigger>
      <ListDisplayConfigurator<
        keyof TeamMembersColumnVisibility,
        TeamMembersSortColumn
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
        setGroupBy={(value) => props.onGroupByChange(value as TeamListGroupBy)}
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

export function TeamMembersTableToolbar(props: TeamMembersTableToolbarProps) {
  const allColumns: ColumnConfig<keyof TeamMembersColumnVisibility>[] = [
    { key: "avatar", label: props.labels.avatar, icon: UserCircle },
    { key: "linkedUser", label: props.labels.linkedUser, icon: User },
    { key: "fullName", label: props.labels.fullName, icon: User },
    { key: "position", label: props.labels.position, icon: Briefcase },
    { key: "department", label: props.labels.department, icon: Briefcase },
    { key: "location", label: props.labels.location, icon: MapPin },
    { key: "phone", label: props.labels.phone, icon: Phone },
    { key: "reportsTo", label: props.labels.reportsTo, icon: Users },
  ];
  const columns = teamMembersDisplayColumnsForViewMode(
    props.viewMode,
    allColumns
  );

  const sortOptions = [
    {
      value: "full_name" as TeamMembersSortColumn,
      label: props.labels.sortByName,
    },
    {
      value: "position" as TeamMembersSortColumn,
      label: props.labels.sortByPosition,
    },
    {
      value: "department" as TeamMembersSortColumn,
      label: props.labels.sortByDepartment,
    },
    {
      value: "created_at" as TeamMembersSortColumn,
      label: props.labels.sortByCreatedAt,
    },
  ];

  const groupByOptions: { value: TeamListGroupBy; label: string }[] = [
    { value: "none", label: props.labels.groupByNone },
    { value: "department", label: props.labels.groupByDepartment },
    { value: "role", label: props.labels.groupByRole },
    { value: "location", label: props.labels.groupByLocation },
  ];

  const selectedCount = props.selectedCount ?? 0;
  const hasSelection = selectedCount > 0;
  const displayVariant = props.displayVariant ?? "compact";

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
          {displayVariant === "compact" && (
            <ListViewModeToggle
              labels={{
                cards: props.labels.cardsView,
                group: props.labels.viewModeGroup,
                table: props.labels.tableView,
              }}
              onChange={props.setViewMode}
              value={props.viewMode}
            />
          )}
          <ListToolbarOverflowItem>
            <TeamMembersDisplayMenu
              columnOrder={props.columnOrder}
              columns={columns}
              columnVisibility={props.columnVisibility}
              displayVariant={displayVariant}
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
