import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  type ColumnConfig,
  DropdownMenu,
  DropdownMenuTrigger,
  ListDisplayConfigurator,
  ListToolbarIconButton,
  type SortOrder,
  type TableSize,
  useListToolbar,
  type ViewMode,
} from "@engenty/ui-core";
import { SlidersHorizontal } from "lucide-react";
import type {
  FolderListColumn,
  FolderListSortColumn,
} from "./folder-list-model";

export function FolderListDisplayMenu({
  columnOrder,
  columns,
  columnVisibility,
  setColumnOrder,
  setColumnVisibility,
  setSortBy,
  setSortOrder,
  setTableSize,
  setViewMode,
  sortBy,
  sortOptions,
  sortOrder,
  tableSize,
  viewMode,
}: {
  columnOrder: FolderListColumn[];
  columns: ColumnConfig<FolderListColumn>[];
  columnVisibility: Record<FolderListColumn, boolean>;
  setColumnOrder: (order: FolderListColumn[]) => void;
  setColumnVisibility: (value: Record<FolderListColumn, boolean>) => void;
  setSortBy: (value: FolderListSortColumn) => void;
  setSortOrder: (value: SortOrder) => void;
  setTableSize: (size: TableSize) => void;
  setViewMode: (mode: ViewMode) => void;
  sortBy: FolderListSortColumn;
  sortOptions: { label: string; value: FolderListSortColumn }[];
  sortOrder: SortOrder;
  tableSize: TableSize;
  viewMode: ViewMode;
}) {
  const { t } = useTranslation("common");
  const { overflowPlacement } = useListToolbar();
  const inMenu = overflowPlacement === "menu";
  const displayLabel = t("spaces.data.list.display", {
    defaultValue: "Display",
  });

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {inMenu ? (
          <Button
            aria-label={displayLabel}
            className="h-9 w-full justify-start gap-1.5"
            size="sm"
            type="button"
            variant="ghost"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {displayLabel}
          </Button>
        ) : (
          <ListToolbarIconButton aria-label={displayLabel} type="button">
            <SlidersHorizontal />
          </ListToolbarIconButton>
        )}
      </DropdownMenuTrigger>
      <ListDisplayConfigurator<FolderListColumn, FolderListSortColumn>
        columnOrder={columnOrder}
        columns={columns}
        columnVisibility={columnVisibility}
        labels={{
          ascending: t("spaces.data.list.ascending", {
            defaultValue: "Ascending",
          }),
          cards: t("spaces.data.list.cardsView", { defaultValue: "Cards" }),
          descending: t("spaces.data.list.descending", {
            defaultValue: "Descending",
          }),
          displayedInTable: t("spaces.data.list.displayedColumns", {
            defaultValue: "Displayed columns",
          }),
          hiddenInTable: t("spaces.data.list.hiddenInTable", {
            defaultValue: "Hidden",
          }),
          hideAll: t("spaces.data.list.hideAll", {
            defaultValue: "Hide all",
          }),
          noColumnsDisplayed: t("spaces.data.list.noColumnsDisplayed", {
            defaultValue: "No columns displayed",
          }),
          showAll: t("spaces.data.list.showAll", { defaultValue: "Show all" }),
          sortBy: t("spaces.data.list.sortBy", { defaultValue: "Sort by" }),
          table: t("spaces.data.list.tableView", { defaultValue: "Table" }),
        }}
        setColumnOrder={setColumnOrder}
        setColumnVisibility={setColumnVisibility}
        setSortBy={setSortBy}
        setSortOrder={setSortOrder}
        setTableSize={setTableSize}
        setViewMode={setViewMode}
        sortBy={sortBy}
        sortOptions={sortOptions}
        sortOrder={sortOrder}
        tableSize={tableSize}
        viewMode={viewMode}
      />
    </DropdownMenu>
  );
}
