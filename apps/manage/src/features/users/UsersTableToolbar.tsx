import {
  type ColumnConfig,
  cn,
  DropdownMenu,
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
  Building2,
  Calendar,
  Mail,
  Shield,
  SlidersHorizontal,
  User,
} from "lucide-react";
import type {
  UsersColumnVisibility,
  UsersSortColumn,
} from "./users-list-display";

export interface UsersTableToolbarLabels {
  ascending: string;
  cardsView: string;
  compactView: string;
  createdAt: string;
  descending: string;
  display: string;
  displayedColumns: string;
  displayName: string;
  email: string;
  hiddenInTable: string;
  hideAll: string;
  itemsPerPage: string;
  noColumnsDisplayed: string;
  paginationSummary: string;
  primaryTenant: string;
  role: string;
  searchPlaceholder: string;
  showAll: string;
  sortBy: string;
  sortByCreatedAt: string;
  sortByEmail: string;
  sortByName: string;
  superAdmin: string;
  tableView: string;
  viewModeGroup: string;
}

interface UsersTableToolbarProps {
  columnOrder: (keyof UsersColumnVisibility)[];
  columnVisibility: UsersColumnVisibility;
  labels: UsersTableToolbarLabels;
  onPageSizeChange: (value: ListPageSize) => void;
  onSearchChange: (value: string) => void;
  onSortByChange: (value: UsersSortColumn) => void;
  onSortOrderChange: (value: SortOrder) => void;
  pageSize: ListPageSize;
  searchQuery: string;
  setColumnOrder: (order: (keyof UsersColumnVisibility)[]) => void;
  setColumnVisibility: (value: UsersColumnVisibility) => void;
  setTableSize: (size: TableSize) => void;
  setViewMode: (mode: ViewMode) => void;
  sortBy: UsersSortColumn;
  sortOrder: SortOrder;
  tableSize: TableSize;
  viewMode: ViewMode;
}

export function UsersTableToolbar(props: UsersTableToolbarProps) {
  const columns: ColumnConfig<keyof UsersColumnVisibility>[] = [
    { key: "displayName", label: props.labels.displayName, icon: User },
    { key: "email", label: props.labels.email, icon: Mail },
    {
      key: "primaryTenant",
      label: props.labels.primaryTenant,
      icon: Building2,
    },
    { key: "role", label: props.labels.role, icon: Shield },
    { key: "superAdmin", label: props.labels.superAdmin, icon: Shield },
    { key: "createdAt", label: props.labels.createdAt, icon: Calendar },
  ];

  const sortOptions = [
    {
      value: "display_name" as UsersSortColumn,
      label: props.labels.sortByName,
    },
    { value: "email" as UsersSortColumn, label: props.labels.sortByEmail },
    {
      value: "created_at" as UsersSortColumn,
      label: props.labels.sortByCreatedAt,
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-2 sm:gap-3 md:flex-row md:items-center">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
        <div className="w-full min-w-0 max-w-full sm:max-w-md md:max-w-lg lg:max-w-xl">
          <ListSearchInput
            className="w-full"
            onChange={(e) => props.onSearchChange(e.target.value)}
            placeholder={props.labels.searchPlaceholder}
            value={props.searchQuery}
            wrapperClassName="w-full"
          />
        </div>
        <p className="min-w-0 shrink-0 whitespace-nowrap text-muted-foreground text-xs tabular-nums">
          {props.labels.paginationSummary}
        </p>
      </div>

      <div
        className={cn(
          "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 md:ml-auto md:shrink-0 md:justify-end",
          "md:max-w-[min(100%,42rem)]"
        )}
      >
        <ListViewModeToggle
          labels={{
            cards: props.labels.cardsView,
            group: props.labels.viewModeGroup,
            table: props.labels.tableView,
          }}
          onChange={props.setViewMode}
          value={props.viewMode}
        />
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <ListToolbarIconButton
              aria-label={props.labels.display}
              type="button"
            >
              <SlidersHorizontal />
            </ListToolbarIconButton>
          </DropdownMenuTrigger>
          <ListDisplayConfigurator<keyof UsersColumnVisibility, UsersSortColumn>
            columnOrder={props.columnOrder}
            columns={columns}
            columnVisibility={props.columnVisibility}
            labels={{
              table: props.labels.tableView,
              cards: props.labels.cardsView,
              compactView: props.labels.compactView,
              sortBy: props.labels.sortBy,
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
      </div>
    </div>
  );
}
