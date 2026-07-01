import {
  Button,
  type ColumnConfig,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  ListDisplayConfigurator,
  ListIconSegmentToggle,
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
  Clock,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  SlidersHorizontal,
  User,
  UserCircle2,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import type { ContactType } from "../../src/schema/index.js";

export interface ContactsColumnVisibility {
  contactName: boolean;
  createdAt: boolean;
  displayName: boolean;
  email: boolean;
  legalName: boolean;
  location: boolean;
  phone: boolean;
  roles: boolean;
}

export type ContactsSortColumn =
  | "display_name"
  | "legal_name"
  | "contact_name"
  | "email"
  | "phone"
  | "location"
  | "created_at";

export type ContactRole = string;

interface ContactsTableToolbarProps {
  allowedContactTypes?: ContactType[];
  bulkActions?: ReactNode;
  clearSelectionLabel?: string;
  columnOrder: (keyof ContactsColumnVisibility)[];
  columnVisibility: ContactsColumnVisibility;
  labels: {
    filterByType: string;
    selectedSummary: string;
    searchPlaceholder: string;
    display: string;
    viewModeGroup: string;
    paginationSummary: string;
    sortByName: string;
    sortByCreatedAt: string;
    ascending: string;
    descending: string;
    compactView: string;
    tableView: string;
    cardsView: string;
    sortBy: string;
    displayedColumns: string;
    hiddenInTable: string;
    showAll: string;
    hideAll: string;
    noColumnsDisplayed: string;
    toolbarMore: string;
    brandName: string;
    createdAt: string;
    displayName: string;
    legalName: string;
    contactName: string;
    email: string;
    phone: string;
    location: string;
    roles: string;
    typeOrganisation: string;
    typePerson: string;
    itemsPerPage: string;
  };
  onClearSelection?: () => void;
  onPageSizeChange: (value: ListPageSize) => void;
  onSearchChange: (value: string) => void;
  onSortByChange: (value: ContactsSortColumn) => void;
  onSortOrderChange: (value: SortOrder) => void;
  onTypeChange?: (type: ContactType | "") => void;
  pageSize: ListPageSize;
  searchQuery: string;
  selectedCount?: number;
  setColumnOrder: (order: (keyof ContactsColumnVisibility)[]) => void;
  setColumnVisibility: (value: ContactsColumnVisibility) => void;
  setTableSize: (size: TableSize) => void;
  setViewMode: (mode: ViewMode) => void;
  sortBy: ContactsSortColumn;
  sortOrder: SortOrder;
  tableSize: TableSize;
  totalCount: number;
  typeFilter?: ContactType | "";
  viewMode: ViewMode;
}

export function ContactsTableToolbar(props: ContactsTableToolbarProps) {
  const columns: ColumnConfig<keyof ContactsColumnVisibility>[] = [
    { key: "legalName", label: props.labels.legalName, icon: Building2 },
    { key: "displayName", label: props.labels.brandName, icon: UserCircle2 },
    { key: "contactName", label: props.labels.contactName, icon: UserCircle2 },
    { key: "email", label: props.labels.email, icon: Mail },
    { key: "phone", label: props.labels.phone, icon: Phone },
    { key: "location", label: props.labels.location, icon: MapPin },
    { key: "roles", label: props.labels.roles, icon: UserCircle2 },
    { key: "createdAt", label: props.labels.createdAt, icon: Clock },
  ];

  const sortOptions = [
    {
      value: "display_name" as ContactsSortColumn,
      label: props.labels.sortByName,
    },
    {
      value: "legal_name" as ContactsSortColumn,
      label: props.labels.legalName,
    },
    {
      value: "contact_name" as ContactsSortColumn,
      label: props.labels.contactName,
    },
    { value: "email" as ContactsSortColumn, label: props.labels.email },
    { value: "phone" as ContactsSortColumn, label: props.labels.phone },
    { value: "location" as ContactsSortColumn, label: props.labels.location },
    {
      value: "created_at" as ContactsSortColumn,
      label: props.labels.sortByCreatedAt,
    },
  ];

  const hasSelection = (props.selectedCount ?? 0) > 0;
  const allowedTypes = props.allowedContactTypes ?? [];
  const activeTypeFilter: ContactType | "" =
    props.typeFilter && allowedTypes.includes(props.typeFilter as ContactType)
      ? (props.typeFilter as ContactType)
      : "";

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
        keyof ContactsColumnVisibility,
        ContactsSortColumn
      >
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
  );

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2 sm:gap-3 md:flex-row md:items-center",
        hasSelection ? "md:flex-nowrap md:overflow-x-auto" : "md:flex-wrap"
      )}
    >
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
                  <MoreHorizontal />
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
            {props.onTypeChange && allowedTypes.length > 0 && (
              <ListIconSegmentToggle
                allowDeselect
                aria-label={props.labels.filterByType}
                className="shrink-0"
                onChange={(next) =>
                  props.onTypeChange?.(next as ContactType | "")
                }
                segments={[
                  ...(allowedTypes.includes("organisation")
                    ? [
                        {
                          value: "organisation" as const,
                          label: props.labels.typeOrganisation,
                          icon: Building2,
                        },
                      ]
                    : []),
                  ...(allowedTypes.includes("person")
                    ? [
                        {
                          value: "person" as const,
                          label: props.labels.typePerson,
                          icon: User,
                        },
                      ]
                    : []),
                ]}
                value={activeTypeFilter}
              />
            )}
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
