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
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
  type SortOrder,
  type TableSize,
  useListToolbar,
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

function SourcesDisplayMenu(props: {
  columnOrder: (keyof SourcesColumnVisibility)[];
  columnVisibility: SourcesColumnVisibility;
  columns: ColumnConfig<keyof SourcesColumnVisibility>[];
  labels: Labels;
  onSortByChange: (value: SourcesSortColumn) => void;
  onSortOrderChange: (value: SortOrder) => void;
  setColumnOrder: (order: (keyof SourcesColumnVisibility)[]) => void;
  setColumnVisibility: (value: SourcesColumnVisibility) => void;
  setTableSize: (size: TableSize) => void;
  setViewMode: (mode: ViewMode) => void;
  sortBy: SourcesSortColumn;
  sortOptions: { value: SourcesSortColumn; label: string }[];
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
      <ListDisplayConfigurator<keyof SourcesColumnVisibility, SourcesSortColumn>
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
  const selectedCount = props.selectedCount ?? 0;

  return (
    <ListToolbar className={props.className} selectedCount={selectedCount}>
      <ListToolbarMainArea>
        <ListToolbarSearch>
          <ListSearchInput
            className="w-full"
            id="kb-sources-toolbar-search"
            onChange={(event) => props.onSearchChange(event.target.value)}
            placeholder={props.labels.searchPlaceholder}
            value={props.searchQuery}
            wrapperClassName="w-full"
          />
        </ListToolbarSearch>
        <Select
          onValueChange={(v) =>
            props.onStatusFilterChange(v as "all" | KbSourceStatus)
          }
          value={props.statusFilter}
        >
          <ListFilterSelectTrigger className="w-[140px]">
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
            className="gap-1.5"
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
        <ListToolbarSummary>
          {props.labels.paginationSummary}
        </ListToolbarSummary>
      </ListToolbarMainArea>

      <ListToolbarActions moreLabel="More">
        <ListToolbarIdleControls>
          <ListToolbarOverflowItem>
            <SourcesDisplayMenu
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
          clearSelectionLabel={
            props.clearSelectionLabel ?? props.labels.clearSelection
          }
          onClearSelection={props.onClearSelection}
        >
          {props.bulkActions}
        </ListToolbarBulkActions>
      </ListToolbarActions>
    </ListToolbar>
  );
}
