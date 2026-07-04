import {
  Button,
  type ColumnConfig,
  DropdownMenu,
  DropdownMenuTrigger,
  Input,
  ListDisplayConfigurator,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import {
  Calendar,
  FileText,
  Hash,
  SlidersHorizontal,
  type SortOrder,
  type TableSize,
  type ViewMode,
  X,
} from "lucide-react";
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
    sortBy: string;
    displayedColumns: string;
    hiddenInTable: string;
    showAll: string;
    hideAll: string;
    noColumnsDisplayed: string;
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

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        className="max-w-sm"
        onChange={(event) => props.onSearchChange(event.target.value)}
        placeholder={props.labels.searchPlaceholder}
        value={props.searchQuery}
      />
      <Select
        onValueChange={(value) =>
          props.onStatusFilterChange(
            value === "all" ? null : (value as OfferStatus)
          )
        }
        value={props.statusFilter ?? "all"}
      >
        <SelectTrigger className="w-44">
          <SelectValue placeholder={props.labels.statusFilterLabel}>
            {(props.statusFilter ?? "all") === "draft"
              ? props.labels.statusDraft
              : (props.statusFilter ?? "all") === "ready"
                ? props.labels.statusReady
                : (props.statusFilter ?? "all") === "accepted"
                  ? props.labels.statusAccepted
                  : props.labels.statusAll}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{props.labels.statusAll}</SelectItem>
          <SelectItem value="draft">{props.labels.statusDraft}</SelectItem>
          <SelectItem value="ready">{props.labels.statusReady}</SelectItem>
          <SelectItem value="accepted">
            {props.labels.statusAccepted}
          </SelectItem>
        </SelectContent>
      </Select>
      <p className="text-muted-foreground text-xs">
        {props.labels.paginationSummary}
      </p>
      {props.selectedCount != null && props.selectedCount > 0 && (
        <>
          {props.bulkActions}
          <Button
            aria-label={props.clearSelectionLabel}
            className="h-8 gap-1"
            onClick={props.onClearSelection}
            size="sm"
            variant="ghost"
          >
            <X className="h-3.5 w-3.5" />
            {props.clearSelectionLabel}
          </Button>
        </>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="ml-auto gap-1.5" size="sm" variant="outline">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {props.labels.display}
          </Button>
        </DropdownMenuTrigger>
        <ListDisplayConfigurator<keyof OffersColumnVisibility, OffersSortColumn>
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
          }}
          setColumnOrder={props.setColumnOrder}
          setColumnVisibility={props.setColumnVisibility}
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
  );
}
