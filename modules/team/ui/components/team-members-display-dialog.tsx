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
  type SortOrder,
  type TableSize,
  type ViewMode,
} from "@engenty/ui-core";
import {
  Briefcase,
  ListFilter,
  MapPin,
  MoreVertical,
  Phone,
  SlidersHorizontal,
  User,
  UserCircle,
  Users,
  X,
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

  const hasSelection = (props.selectedCount ?? 0) > 0;
  const displayVariant = props.displayVariant ?? "compact";

  const renderDisplayMenu = (variant: "default" | "overflow-full") => (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {variant === "default" && displayVariant === "compact" ? (
          <ListToolbarIconButton
            aria-label={props.labels.display}
            type="button"
          >
            <SlidersHorizontal />
          </ListToolbarIconButton>
        ) : (
          <Button
            aria-label={props.labels.display}
            className={cn(
              "gap-1.5",
              variant === "overflow-full" && "h-9 w-full justify-start"
            )}
            size="sm"
            type="button"
            variant={variant === "overflow-full" ? "ghost" : "outline"}
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
        setGroupBy={(value) => props.onGroupByChange(value as TeamListGroupBy)}
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
            onOpenFilters={() => {
              if (!props.filtersExpanded) {
                props.onFiltersToggle();
              }
            }}
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
            {renderDisplayMenu("default")}
          </div>
        )}
      </div>
    </div>
  );
}
