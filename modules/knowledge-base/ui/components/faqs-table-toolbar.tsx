import {
  Button,
  type ColumnConfig,
  DropdownMenu,
  DropdownMenuTrigger,
  ListDisplayConfigurator,
  ListSearchInput,
  ListToolbarIconButton,
  type SortOrder,
  type TableSize,
  type ViewMode,
} from "@engenty/ui-core";
import {
  Calendar,
  FileText,
  Hash,
  type LucideIcon,
  SlidersHorizontal,
  Tag,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import type { FaqSortColumn } from "../../src/schema/shared.js";
import type { getFaqsToolbarLabels } from "../lib/faqs-toolbar-labels.js";

export interface FaqsColumnVisibility {
  createdAt: boolean;
  question: boolean;
  sortOrder: boolean;
  status: boolean;
  tags: boolean;
  updatedAt: boolean;
}

export type FaqsSortColumn = FaqSortColumn;

type Labels = ReturnType<typeof getFaqsToolbarLabels>;

interface FaqsTableToolbarProps {
  bulkActions?: ReactNode;
  className?: string;
  clearSelectionLabel?: string;
  columnOrder: (keyof FaqsColumnVisibility)[];
  columnVisibility: FaqsColumnVisibility;
  labels: Labels;
  onClearSelection?: () => void;
  onSearchChange: (value: string) => void;
  onSortByChange: (value: FaqsSortColumn) => void;
  onSortOrderChange: (value: SortOrder) => void;
  searchQuery: string;
  selectedCount?: number;
  setColumnOrder: (order: (keyof FaqsColumnVisibility)[]) => void;
  setColumnVisibility: (value: FaqsColumnVisibility) => void;
  setTableSize: (size: TableSize) => void;
  setViewMode: (mode: ViewMode) => void;
  sortBy: FaqsSortColumn;
  sortOrder: SortOrder;
  tableSize: TableSize;
  viewMode: ViewMode;
}

const COLUMN_ICONS: Record<keyof FaqsColumnVisibility, LucideIcon> = {
  question: FileText,
  status: FileText,
  sortOrder: Hash,
  tags: Tag,
  createdAt: Calendar,
  updatedAt: Calendar,
};

export function FaqsTableToolbar(props: FaqsTableToolbarProps) {
  const columns: ColumnConfig<keyof FaqsColumnVisibility>[] = (
    [
      ["question", props.labels.question],
      ["status", props.labels.status],
      ["sortOrder", props.labels.sortOrder],
      ["tags", props.labels.tags],
      ["createdAt", props.labels.createdAt],
      ["updatedAt", props.labels.updatedAt],
    ] as const
  ).map(([key, label]) => ({
    key,
    label,
    icon: COLUMN_ICONS[key],
  }));

  const sortOptions = [
    {
      value: "question" as FaqsSortColumn,
      label: props.labels.sortByQuestion,
    },
    { value: "status" as FaqsSortColumn, label: props.labels.sortByStatus },
    {
      value: "created_at" as FaqsSortColumn,
      label: props.labels.sortByCreatedAt,
    },
    {
      value: "updated_at" as FaqsSortColumn,
      label: props.labels.sortByUpdatedAt,
    },
    {
      value: "sort_order" as FaqsSortColumn,
      label: props.labels.sortBySortOrder,
    },
  ];

  return (
    <div
      className={`flex min-w-0 flex-1 flex-wrap items-center gap-2 ${props.className ?? ""}`}
    >
      <ListSearchInput
        className="max-w-sm"
        onChange={(event) => props.onSearchChange(event.target.value)}
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
          <ListToolbarIconButton
            aria-label={props.labels.display}
            className="ml-auto"
          >
            <SlidersHorizontal />
          </ListToolbarIconButton>
        </DropdownMenuTrigger>
        <ListDisplayConfigurator<keyof FaqsColumnVisibility, FaqsSortColumn>
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
