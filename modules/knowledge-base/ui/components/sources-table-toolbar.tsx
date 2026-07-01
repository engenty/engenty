import {
  Button,
  type ColumnConfig,
  DropdownMenu,
  DropdownMenuTrigger,
  ListDisplayConfigurator,
  ListFilterSelectTrigger,
  ListSearchInput,
  ListToolbarIconButton,
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
  type SortOrder,
  type TableSize,
  type ViewMode,
} from "@engenty/ui-core";
import { SlidersHorizontal, X } from "lucide-react";
import type * as React from "react";
import type { KbSourceStatus } from "../../src/schema/types.js";
import type { getSourcesToolbarLabels } from "../lib/sources-toolbar-labels.js";
import type {
  SourcesColumnVisibility,
  SourcesSortColumn,
} from "./sources-table.js";

type Labels = ReturnType<typeof getSourcesToolbarLabels>;

interface SourcesTableToolbarProps {
  bulkActions?: React.ReactNode;
  className?: string;
  clearSelectionLabel?: string;
  columnOrder: (keyof SourcesColumnVisibility)[];
  columnVisibility: SourcesColumnVisibility;
  labels: Labels;
  onClearSelection?: () => void;
  onSearchChange: (value: string) => void;
  onSortByChange: (value: SourcesSortColumn) => void;
  onSortOrderChange: (value: SortOrder) => void;
  onStatusFilterChange: (value: "all" | KbSourceStatus) => void;
  searchQuery: string;
  selectedCount?: number;
  setColumnOrder: (order: (keyof SourcesColumnVisibility)[]) => void;
  setColumnVisibility: (value: SourcesColumnVisibility) => void;
  setTableSize: (size: TableSize) => void;
  setViewMode: (mode: ViewMode) => void;
  sortBy: SourcesSortColumn;
  sortOrder: SortOrder;
  statusFilter: "all" | KbSourceStatus;
  tableSize: TableSize;
  viewMode: ViewMode;
}

export function SourcesTableToolbar(props: SourcesTableToolbarProps) {
  const columns: ColumnConfig<keyof SourcesColumnVisibility>[] = (
    [
      ["name", props.labels.name],
      ["adapter", props.labels.adapter],
      ["status", props.labels.status],
      ["lastRun", props.labels.lastRun],
      ["nextRun", props.labels.nextRun],
      ["updatedAt", props.labels.updatedAt],
      ["createdAt", props.labels.createdAt],
    ] as const
  ).map(([key, label]) => ({ key, label }));

  const sortOptions = [
    { value: "name" as SourcesSortColumn, label: props.labels.sortByName },
    {
      value: "created_at" as SourcesSortColumn,
      label: props.labels.sortByCreatedAt,
    },
    {
      value: "updated_at" as SourcesSortColumn,
      label: props.labels.sortByUpdatedAt,
    },
    {
      value: "last_run_at" as SourcesSortColumn,
      label: props.labels.sortByLastRun,
    },
    {
      value: "next_run_at" as SourcesSortColumn,
      label: props.labels.sortByNextRun,
    },
  ];

  const hasActiveFilters =
    props.searchQuery.trim().length > 0 || props.statusFilter !== "all";

  return (
    <div
      className={`flex min-w-0 flex-1 flex-wrap items-center gap-2 ${props.className ?? ""}`}
    >
      <ListSearchInput
        className="h-9 text-xs"
        id="kb-sources-toolbar-search"
        onChange={(event) => props.onSearchChange(event.target.value)}
        placeholder={props.labels.searchPlaceholder}
        value={props.searchQuery}
        wrapperClassName="max-w-sm flex-1"
      />
      <p className="text-muted-foreground text-xs">
        {props.labels.paginationSummary}
      </p>
      <Select
        onValueChange={(v) =>
          props.onStatusFilterChange(v as "all" | KbSourceStatus)
        }
        value={props.statusFilter}
      >
        <ListFilterSelectTrigger className="h-9 w-[140px] text-xs">
          <SelectValue>
            {props.statusFilter === "all"
              ? props.labels.statusFilterAll
              : props.statusFilter === "active"
                ? props.labels.filterActive
                : props.statusFilter === "paused"
                  ? props.labels.filterPaused
                  : props.labels.filterFailed}
          </SelectValue>
        </ListFilterSelectTrigger>
        <SelectContent>
          <SelectItem value="all">{props.labels.statusFilterAll}</SelectItem>
          <SelectItem value="active">{props.labels.filterActive}</SelectItem>
          <SelectItem value="paused">{props.labels.filterPaused}</SelectItem>
          <SelectItem value="failed">{props.labels.filterFailed}</SelectItem>
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
          {props.clearSelectionLabel ?? props.labels.clearSelection}
        </Button>
      ) : null}
      <div className="ml-auto flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ListToolbarIconButton
              aria-label={props.labels.display}
              type="button"
            >
              <SlidersHorizontal />
            </ListToolbarIconButton>
          </DropdownMenuTrigger>
          <ListDisplayConfigurator<
            keyof SourcesColumnVisibility,
            SourcesSortColumn
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
