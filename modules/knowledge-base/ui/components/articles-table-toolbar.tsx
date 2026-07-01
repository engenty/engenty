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
import type { ArticleSortColumn } from "../../src/schema/shared.js";
import type { getArticlesToolbarLabels } from "../lib/articles-toolbar-labels.js";

export interface ArticlesColumnVisibility {
  createdAt: boolean;
  slug: boolean;
  sortOrder: boolean;
  status: boolean;
  tags: boolean;
  title: boolean;
  updatedAt: boolean;
}

export type ArticlesSortColumn = ArticleSortColumn;

type Labels = ReturnType<typeof getArticlesToolbarLabels>;

interface ArticlesTableToolbarProps {
  bulkActions?: ReactNode;
  className?: string;
  clearSelectionLabel?: string;
  columnOrder: (keyof ArticlesColumnVisibility)[];
  columnVisibility: ArticlesColumnVisibility;
  labels: Labels;
  onClearSelection?: () => void;
  onSearchChange: (value: string) => void;
  onSortByChange: (value: ArticlesSortColumn) => void;
  onSortOrderChange: (value: SortOrder) => void;
  searchQuery: string;
  selectedCount?: number;
  setColumnOrder: (order: (keyof ArticlesColumnVisibility)[]) => void;
  setColumnVisibility: (value: ArticlesColumnVisibility) => void;
  setTableSize: (size: TableSize) => void;
  setViewMode: (mode: ViewMode) => void;
  sortBy: ArticlesSortColumn;
  sortOrder: SortOrder;
  tableSize: TableSize;
  viewMode: ViewMode;
}

const COLUMN_ICONS: Record<keyof ArticlesColumnVisibility, LucideIcon> = {
  title: FileText,
  slug: Hash,
  status: FileText,
  tags: Tag,
  sortOrder: Hash,
  createdAt: Calendar,
  updatedAt: Calendar,
};

export function ArticlesTableToolbar(props: ArticlesTableToolbarProps) {
  const columns: ColumnConfig<keyof ArticlesColumnVisibility>[] = (
    [
      ["title", props.labels.title],
      ["slug", props.labels.slug],
      ["status", props.labels.status],
      ["tags", props.labels.tags],
      ["sortOrder", props.labels.sortOrder],
      ["createdAt", props.labels.createdAt],
      ["updatedAt", props.labels.updatedAt],
    ] as const
  ).map(([key, label]) => ({
    key,
    label,
    icon: COLUMN_ICONS[key],
  }));

  const sortOptions = [
    { value: "title" as ArticlesSortColumn, label: props.labels.sortByTitle },
    { value: "status" as ArticlesSortColumn, label: props.labels.sortByStatus },
    {
      value: "created_at" as ArticlesSortColumn,
      label: props.labels.sortByCreatedAt,
    },
    {
      value: "updated_at" as ArticlesSortColumn,
      label: props.labels.sortByUpdatedAt,
    },
    {
      value: "sort_order" as ArticlesSortColumn,
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
        <ListDisplayConfigurator<
          keyof ArticlesColumnVisibility,
          ArticlesSortColumn
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
