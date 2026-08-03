import {
  Button,
  type ColumnConfig,
  DropdownMenu,
  DropdownMenuTrigger,
  ListDisplayConfigurator,
  ListFilterSelectTrigger,
  ListSearchInput,
  ListToolbar,
  ListToolbarActions,
  ListToolbarBulkActions,
  ListToolbarIconButton,
  ListToolbarIdleControls,
  ListToolbarMainArea,
  ListToolbarOverflowItem,
  ListToolbarSearch,
  ListToolbarSummary,
  ListViewModeToggle,
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
  type SortOrder,
  type TableSize,
  useListToolbar,
  type ViewMode,
} from "@engenty/ui-core";
import { Calendar, FileText, Hash, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import type { OfferStatus } from "../api.js";

export interface OffersColumnVisibility {
  offerDate: boolean;
  offerNumber: boolean;
  status: boolean;
  title: boolean;
  validUntil: boolean;
}

export type OffersSortColumn =
  | "title"
  | "offer_number"
  | "status"
  | "offer_date"
  | "valid_until"
  | "created_at";

interface OffersTableToolbarProps {
  /** Rendered when selection is active (e.g. bulk Delete button) */
  bulkActions?: ReactNode;
  clearSelectionLabel?: string;
  columnOrder: (keyof OffersColumnVisibility)[];
  columnVisibility: OffersColumnVisibility;
  labels: {
    searchPlaceholder: string;
    statusFilterLabel: string;
    statusAll: string;
    statusDraft: string;
    statusReady: string;
    statusAccepted: string;
    display: string;
    paginationSummary: string;
    selectedSummary?: string;
    sortByTitle: string;
    sortByOfferNumber: string;
    sortByStatus: string;
    sortByOfferDate: string;
    sortByValidUntil: string;
    sortByCreatedAt: string;
    ascending: string;
    descending: string;
    compactView: string;
    tableView: string;
    cardsView: string;
    viewModeGroup?: string;
    sortBy: string;
    displayedColumns: string;
    hiddenInTable: string;
    showAll: string;
    hideAll: string;
    noColumnsDisplayed: string;
    toolbarMore?: string;
    title: string;
    offerNumber: string;
    status: string;
    offerDate: string;
    validUntil: string;
  };
  onClearSelection?: () => void;
  onSearchChange: (value: string) => void;
  onSortByChange: (value: OffersSortColumn) => void;
  onSortOrderChange: (value: SortOrder) => void;
  onStatusFilterChange: (value: OfferStatus | null) => void;
  searchQuery: string;
  /** Number of selected rows; when > 0, shows bulkActions and clear button */
  selectedCount?: number;
  setColumnOrder: (order: (keyof OffersColumnVisibility)[]) => void;
  setColumnVisibility: (value: OffersColumnVisibility) => void;
  setTableSize: (size: TableSize) => void;
  setViewMode: (mode: ViewMode) => void;
  sortBy: OffersSortColumn;
  sortOrder: SortOrder;
  statusFilter: OfferStatus | null;
  tableSize: TableSize;
  viewMode: ViewMode;
}

function OffersDisplayMenu(props: {
  columnOrder: (keyof OffersColumnVisibility)[];
  columnVisibility: OffersColumnVisibility;
  columns: ColumnConfig<keyof OffersColumnVisibility>[];
  labels: OffersTableToolbarProps["labels"];
  onSortByChange: (value: OffersSortColumn) => void;
  onSortOrderChange: (value: SortOrder) => void;
  setColumnOrder: (order: (keyof OffersColumnVisibility)[]) => void;
  setColumnVisibility: (value: OffersColumnVisibility) => void;
  setTableSize: (size: TableSize) => void;
  setViewMode: (mode: ViewMode) => void;
  sortBy: OffersSortColumn;
  sortOptions: { value: OffersSortColumn; label: string }[];
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
      <ListDisplayConfigurator<keyof OffersColumnVisibility, OffersSortColumn>
        columnOrder={props.columnOrder}
        columns={props.columns}
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
        }}
        setColumnOrder={props.setColumnOrder}
        setColumnVisibility={props.setColumnVisibility}
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

export function OffersTableToolbar(props: OffersTableToolbarProps) {
  const columns: ColumnConfig<keyof OffersColumnVisibility>[] = [
    { key: "title", label: props.labels.title, icon: FileText },
    { key: "offerNumber", label: props.labels.offerNumber, icon: Hash },
    { key: "status", label: props.labels.status, icon: FileText },
    { key: "offerDate", label: props.labels.offerDate, icon: Calendar },
    { key: "validUntil", label: props.labels.validUntil, icon: Calendar },
  ];

  const sortOptions = [
    { value: "title" as OffersSortColumn, label: props.labels.sortByTitle },
    {
      value: "offer_number" as OffersSortColumn,
      label: props.labels.sortByOfferNumber,
    },
    { value: "status" as OffersSortColumn, label: props.labels.sortByStatus },
    {
      value: "offer_date" as OffersSortColumn,
      label: props.labels.sortByOfferDate,
    },
    {
      value: "valid_until" as OffersSortColumn,
      label: props.labels.sortByValidUntil,
    },
    {
      value: "created_at" as OffersSortColumn,
      label: props.labels.sortByCreatedAt,
    },
  ];

  const selectedCount = props.selectedCount ?? 0;
  const hasSelection = selectedCount > 0;
  const statusValue = props.statusFilter ?? "all";
  const statusLabel =
    statusValue === "draft"
      ? props.labels.statusDraft
      : statusValue === "ready"
        ? props.labels.statusReady
        : statusValue === "accepted"
          ? props.labels.statusAccepted
          : props.labels.statusAll;

  return (
    <ListToolbar selectedCount={selectedCount}>
      <ListToolbarMainArea>
        <ListToolbarSearch>
          <ListSearchInput
            className="w-full"
            onChange={(event) => props.onSearchChange(event.target.value)}
            placeholder={props.labels.searchPlaceholder}
            value={props.searchQuery}
            wrapperClassName="w-full"
          />
        </ListToolbarSearch>
        <Select
          onValueChange={(value) =>
            props.onStatusFilterChange(
              value === "all" ? null : (value as OfferStatus)
            )
          }
          value={statusValue}
        >
          <ListFilterSelectTrigger
            aria-label={props.labels.statusFilterLabel}
            className="w-44"
          >
            <SelectValue placeholder={props.labels.statusFilterLabel}>
              {statusLabel}
            </SelectValue>
          </ListFilterSelectTrigger>
          <SelectContent>
            <SelectItem value="all">{props.labels.statusAll}</SelectItem>
            <SelectItem value="draft">{props.labels.statusDraft}</SelectItem>
            <SelectItem value="ready">{props.labels.statusReady}</SelectItem>
            <SelectItem value="accepted">
              {props.labels.statusAccepted}
            </SelectItem>
          </SelectContent>
        </Select>
        <ListToolbarSummary>
          {hasSelection && props.labels.selectedSummary
            ? props.labels.selectedSummary
            : props.labels.paginationSummary}
        </ListToolbarSummary>
      </ListToolbarMainArea>

      <ListToolbarActions moreLabel={props.labels.toolbarMore ?? "More"}>
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
            <OffersDisplayMenu
              columnOrder={props.columnOrder}
              columns={columns}
              columnVisibility={props.columnVisibility}
              labels={props.labels}
              onSortByChange={props.onSortByChange}
              onSortOrderChange={props.onSortOrderChange}
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
