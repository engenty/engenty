import {
  Button,
  type ColumnConfig,
  DropdownMenu,
  DropdownMenuTrigger,
  ListDisplayConfigurator,
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
  type SortOrder,
  type TableSize,
  useListToolbar,
  type ViewMode,
} from "@engenty/ui-core";
import {
  Calendar,
  FileText,
  Hash,
  SlidersHorizontal,
  User,
} from "lucide-react";
import type { ReactNode } from "react";

export interface InvoicesColumnVisibility {
  content: boolean;
  date: boolean;
  dueDate: boolean;
  number: boolean;
  recipient: boolean;
  sumBrutto: boolean;
}

export type InvoicesSortColumn =
  | "number"
  | "date"
  | "dueDate"
  | "sumBrutto"
  | "createdAt";

interface InvoicesTableToolbarProps {
  bulkActions?: ReactNode;
  clearSelectionLabel?: string;
  columnOrder: (keyof InvoicesColumnVisibility)[];
  columnVisibility: InvoicesColumnVisibility;
  labels: {
    searchPlaceholder: string;
    display: string;
    paginationSummary: string;
    sortByNumber: string;
    sortByDate: string;
    sortByDueDate: string;
    sortBySumBrutto: string;
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
    number: string;
    date: string;
    dueDate: string;
    recipient: string;
    sumBrutto: string;
    content: string;
  };
  onClearSelection?: () => void;
  onSearchChange: (value: string) => void;
  onSortByChange: (value: InvoicesSortColumn) => void;
  onSortOrderChange: (value: SortOrder) => void;
  searchQuery: string;
  selectedCount?: number;
  setColumnOrder: (order: (keyof InvoicesColumnVisibility)[]) => void;
  setColumnVisibility: (value: InvoicesColumnVisibility) => void;
  setTableSize: (size: TableSize) => void;
  setViewMode: (mode: ViewMode) => void;
  sortBy: InvoicesSortColumn;
  sortOrder: SortOrder;
  tableSize: TableSize;
  totalCount: number;
  viewMode: ViewMode;
}

function InvoicesDisplayMenu(props: {
  columnOrder: (keyof InvoicesColumnVisibility)[];
  columnVisibility: InvoicesColumnVisibility;
  columns: ColumnConfig<keyof InvoicesColumnVisibility>[];
  labels: InvoicesTableToolbarProps["labels"];
  onSortByChange: (value: InvoicesSortColumn) => void;
  onSortOrderChange: (value: SortOrder) => void;
  setColumnOrder: (order: (keyof InvoicesColumnVisibility)[]) => void;
  setColumnVisibility: (value: InvoicesColumnVisibility) => void;
  setTableSize: (size: TableSize) => void;
  setViewMode: (mode: ViewMode) => void;
  sortBy: InvoicesSortColumn;
  sortOptions: { value: InvoicesSortColumn; label: string }[];
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
        keyof InvoicesColumnVisibility,
        InvoicesSortColumn
      >
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

export function InvoicesTableToolbar(props: InvoicesTableToolbarProps) {
  const columns: ColumnConfig<keyof InvoicesColumnVisibility>[] = [
    { key: "number", label: props.labels.number, icon: Hash },
    { key: "date", label: props.labels.date, icon: Calendar },
    { key: "dueDate", label: props.labels.dueDate, icon: Calendar },
    { key: "recipient", label: props.labels.recipient, icon: User },
    { key: "sumBrutto", label: props.labels.sumBrutto, icon: FileText },
    { key: "content", label: props.labels.content, icon: FileText },
  ];

  const sortOptions = [
    { value: "number" as InvoicesSortColumn, label: props.labels.sortByNumber },
    { value: "date" as InvoicesSortColumn, label: props.labels.sortByDate },
    {
      value: "dueDate" as InvoicesSortColumn,
      label: props.labels.sortByDueDate,
    },
    {
      value: "sumBrutto" as InvoicesSortColumn,
      label: props.labels.sortBySumBrutto,
    },
    {
      value: "createdAt" as InvoicesSortColumn,
      label: props.labels.sortByCreatedAt,
    },
  ];

  const selectedCount = props.selectedCount ?? 0;

  return (
    <ListToolbar selectedCount={selectedCount}>
      <ListToolbarMainArea>
        <ListToolbarSearch>
          <ListSearchInput
            className="w-full"
            onChange={(e) => props.onSearchChange(e.target.value)}
            placeholder={props.labels.searchPlaceholder}
            value={props.searchQuery}
            wrapperClassName="w-full"
          />
        </ListToolbarSearch>
        <ListToolbarSummary>
          {props.labels.paginationSummary}
        </ListToolbarSummary>
      </ListToolbarMainArea>

      <ListToolbarActions moreLabel="More">
        <ListToolbarIdleControls>
          <ListViewModeToggle
            labels={{
              cards: props.labels.cardsView,
              table: props.labels.tableView,
            }}
            onChange={props.setViewMode}
            value={props.viewMode}
          />
          <ListToolbarOverflowItem>
            <InvoicesDisplayMenu
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
