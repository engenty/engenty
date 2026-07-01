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
  type SortOrder,
  type TableSize,
  type ViewMode,
} from "@engenty/ui-core";
import { Plug, Search, SlidersHorizontal, X } from "lucide-react";
import type * as React from "react";
import type { InboxStatus } from "../../src/schema/types.js";
import type { getInboxToolbarLabels } from "../lib/inbox-toolbar-labels.js";

export type InboxSortColumn = "captured_at" | "updated_at" | "title" | "status";

export interface InboxColumnVisibility {
  capturedAt: boolean;
  linkedAdapter: boolean;
  sourceType: boolean;
  status: boolean;
  title: boolean;
}

type Labels = ReturnType<typeof getInboxToolbarLabels>;

export interface InboxTableToolbarProps {
  bulkActions?: React.ReactNode;
  className?: string;
  clearSelectionLabel?: string;
  columnOrder: (keyof InboxColumnVisibility)[];
  columnVisibility: InboxColumnVisibility;
  labels: Labels;
  onClearSelection?: () => void;
  onSearchChange: (value: string) => void;
  onSortByChange: (value: InboxSortColumn) => void;
  onSortOrderChange: (value: SortOrder) => void;
  onStatusFilterChange: (value: "all" | InboxStatus) => void;
  searchQuery: string;
  selectedCount?: number;
  setColumnOrder: (order: (keyof InboxColumnVisibility)[]) => void;
  setColumnVisibility: (value: InboxColumnVisibility) => void;
  setTableSize: (size: TableSize) => void;
  setViewMode: (mode: ViewMode) => void;
  sortBy: InboxSortColumn;
  sortOrder: SortOrder;
  statusFilter: "all" | InboxStatus;
  tableSize: TableSize;
  viewMode: ViewMode;
}

export function InboxTableToolbar(props: InboxTableToolbarProps) {
  const columns: ColumnConfig<keyof InboxColumnVisibility>[] = [
    { key: "title", label: props.labels.colTitle },
    { key: "status", label: props.labels.colStatus },
    { key: "sourceType", label: props.labels.colSourceType },
    {
      icon: Plug,
      key: "linkedAdapter",
      label: props.labels.colAdapterType,
    },
    { key: "capturedAt", label: props.labels.colCaptured },
  ];

  const sortOptions = [
    {
      value: "captured_at" as InboxSortColumn,
      label: props.labels.sortByCaptured,
    },
    {
      value: "updated_at" as InboxSortColumn,
      label: props.labels.sortByUpdated,
    },
    { value: "title" as InboxSortColumn, label: props.labels.sortByTitle },
    { value: "status" as InboxSortColumn, label: props.labels.sortByStatus },
  ];

  const hasActiveFilters =
    props.searchQuery.trim().length > 0 || props.statusFilter !== "all";

  return (
    <div
      className={`flex min-w-0 flex-1 flex-wrap items-center gap-2 ${props.className ?? ""}`}
    >
      <div className="relative max-w-sm flex-1">
        <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-9 pl-8 text-xs"
          id="kb-inbox-toolbar-search"
          onChange={(event) => props.onSearchChange(event.target.value)}
          placeholder={props.labels.searchPlaceholder}
          value={props.searchQuery}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        {props.labels.paginationSummary}
      </p>
      <Select
        onValueChange={(v) =>
          props.onStatusFilterChange(v === "all" ? "all" : (v as InboxStatus))
        }
        value={props.statusFilter}
      >
        <SelectTrigger className="h-9 w-[150px] text-xs">
          <SelectValue>
            {props.statusFilter === "all"
              ? props.labels.statusFilterAll
              : props.statusFilter === "new"
                ? props.labels.statusNew
                : props.statusFilter === "triaged"
                  ? props.labels.statusTriaged
                  : props.statusFilter === "needs_review"
                    ? props.labels.statusNeedsReview
                    : props.statusFilter === "promoted"
                      ? props.labels.statusPromoted
                      : props.statusFilter === "discarded"
                        ? props.labels.statusDiscarded
                        : props.labels.statusFailed}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{props.labels.statusFilterAll}</SelectItem>
          <SelectItem value="new">{props.labels.statusNew}</SelectItem>
          <SelectItem value="triaged">{props.labels.statusTriaged}</SelectItem>
          <SelectItem value="needs_review">
            {props.labels.statusNeedsReview}
          </SelectItem>
          <SelectItem value="promoted">
            {props.labels.statusPromoted}
          </SelectItem>
          <SelectItem value="discarded">
            {props.labels.statusDiscarded}
          </SelectItem>
          <SelectItem value="failed">{props.labels.statusFailed}</SelectItem>
        </SelectContent>
      </Select>
      {hasActiveFilters ? (
        <Button
          className="h-9 gap-1.5 px-2 text-xs"
          onClick={() => {
            props.onSearchChange("");
            props.onStatusFilterChange("all");
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          <X className="h-3.5 w-3.5" />
          {props.labels.clearFilters}
        </Button>
      ) : null}
      {props.selectedCount != null && props.selectedCount > 0
        ? props.bulkActions
        : null}
      {props.selectedCount != null &&
      props.selectedCount > 0 &&
      props.onClearSelection ? (
        <Button
          aria-label={props.clearSelectionLabel}
          className="h-9 gap-1.5 px-2 text-xs"
          onClick={props.onClearSelection}
          size="sm"
          type="button"
          variant="ghost"
        >
          <X className="h-3.5 w-3.5" />
          {props.clearSelectionLabel}
        </Button>
      ) : null}
      <div className="ml-auto flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className="h-9 gap-1.5 px-2.5 text-xs"
              size="sm"
              type="button"
              variant="outline"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {props.labels.display}
            </Button>
          </DropdownMenuTrigger>
          <ListDisplayConfigurator<keyof InboxColumnVisibility, InboxSortColumn>
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
    </div>
  );
}
