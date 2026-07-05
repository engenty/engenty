import {
  Button,
  type ColumnConfig,
  DropdownMenu,
  DropdownMenuTrigger,
  Input,
  ListDisplayConfigurator,
  type SortOrder,
  type TableSize,
  type ViewMode,
} from "@engenty/ui-core";
import {
  Calendar,
  FileText,
  Hash,
  SlidersHorizontal,
  User,
  X,
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

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        className="max-w-sm"
        onChange={(e) => props.onSearchChange(e.target.value)}
        placeholder={props.labels.searchPlaceholder}
        value={props.searchQuery}
      />
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
        <ListDisplayConfigurator<
          keyof InvoicesColumnVisibility,
          InvoicesSortColumn
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
  );
}
