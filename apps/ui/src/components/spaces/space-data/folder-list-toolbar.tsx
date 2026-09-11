import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  type ColumnConfig,
  ListSearchInput,
  ListToolbar,
  ListToolbarActions,
  ListToolbarBulkActions,
  ListToolbarIdleControls,
  ListToolbarMainArea,
  ListToolbarOverflowItem,
  ListToolbarSearch,
  ListToolbarSummary,
  ListViewModeToggle,
  type SortOrder,
  type TableSize,
  type ViewMode,
} from "@engenty/ui-core";
import { Calendar, Folder, FolderInput, Trash2, Type } from "lucide-react";
import { FolderListDisplayMenu } from "./folder-list-display-menu";
import type {
  FolderListColumn,
  FolderListSortColumn,
} from "./folder-list-model";

export interface FolderListBulkControls {
  canDelete: boolean;
  canMove: boolean;
  onClearSelection: () => void;
  onDelete: () => void;
  onMove: () => void;
  pending: boolean;
  selectedCount: number;
}

export function FolderListToolbar({
  bulk,
  columnOrder,
  columnVisibility,
  onSearchChange,
  searchQuery,
  setColumnOrder,
  setColumnVisibility,
  setSortBy,
  setSortOrder,
  setTableSize,
  setViewMode,
  sortBy,
  sortOrder,
  summary,
  tableSize,
  viewMode,
}: {
  bulk?: FolderListBulkControls;
  columnOrder: FolderListColumn[];
  columnVisibility: Record<FolderListColumn, boolean>;
  onSearchChange: (value: string) => void;
  searchQuery: string;
  setColumnOrder: (order: FolderListColumn[]) => void;
  setColumnVisibility: (value: Record<FolderListColumn, boolean>) => void;
  setSortBy: (value: FolderListSortColumn) => void;
  setSortOrder: (value: SortOrder) => void;
  setTableSize: (size: TableSize) => void;
  setViewMode: (mode: ViewMode) => void;
  sortBy: FolderListSortColumn;
  sortOrder: SortOrder;
  summary: string;
  tableSize: TableSize;
  viewMode: ViewMode;
}) {
  const { t } = useTranslation("common");
  const columns: ColumnConfig<FolderListColumn>[] = [
    {
      icon: Type,
      key: "name",
      label: t("spaces.data.colName", { defaultValue: "Name" }),
    },
    {
      icon: Folder,
      key: "kind",
      label: t("spaces.data.colKind", { defaultValue: "Type" }),
    },
    {
      icon: Calendar,
      key: "updatedAt",
      label: t("spaces.data.colEdited", { defaultValue: "Edited" }),
    },
  ];
  const sortOptions: { label: string; value: FolderListSortColumn }[] = [
    {
      label: t("spaces.data.colName", { defaultValue: "Name" }),
      value: "name",
    },
    {
      label: t("spaces.data.colKind", { defaultValue: "Type" }),
      value: "kind",
    },
    {
      label: t("spaces.data.colEdited", { defaultValue: "Edited" }),
      value: "updatedAt",
    },
  ];

  const selectedCount = bulk?.selectedCount ?? 0;

  return (
    <ListToolbar selectedCount={selectedCount}>
      <ListToolbarMainArea>
        <ListToolbarSearch>
          <ListSearchInput
            className="w-full"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t("spaces.data.list.searchPlaceholder", {
              defaultValue: "Search…",
            })}
            value={searchQuery}
            wrapperClassName="w-full"
          />
        </ListToolbarSearch>
        <ListToolbarSummary>
          {selectedCount > 0
            ? t("spaces.data.list.selectedSummary", {
                count: selectedCount,
                defaultValue: "{{count}} selected",
              })
            : summary}
        </ListToolbarSummary>
      </ListToolbarMainArea>
      <ListToolbarActions
        moreLabel={t("actions.more", { defaultValue: "More actions" })}
      >
        <ListToolbarIdleControls>
          <ListViewModeToggle
            labels={{
              cards: t("spaces.data.list.cardsView", {
                defaultValue: "Cards",
              }),
              table: t("spaces.data.list.tableView", {
                defaultValue: "Table",
              }),
            }}
            onChange={setViewMode}
            value={viewMode}
          />
          <ListToolbarOverflowItem>
            <FolderListDisplayMenu
              columnOrder={columnOrder}
              columns={columns}
              columnVisibility={columnVisibility}
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
          </ListToolbarOverflowItem>
        </ListToolbarIdleControls>
        {bulk ? (
          <ListToolbarBulkActions
            clearSelectionLabel={t("actions.cancel", {
              defaultValue: "Cancel",
            })}
            onClearSelection={bulk.onClearSelection}
          >
            {bulk.canMove ? (
              <Button
                className="gap-1.5"
                disabled={bulk.pending}
                onClick={bulk.onMove}
                size="sm"
                variant="outline"
              >
                <FolderInput className="h-3.5 w-3.5" />
                {t("spaces.data.list.moveSelected", { defaultValue: "Move" })}
              </Button>
            ) : null}
            {bulk.canDelete ? (
              <Button
                className="gap-1.5"
                disabled={bulk.pending}
                onClick={bulk.onDelete}
                size="sm"
                variant="destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t("spaces.data.list.deleteSelected", {
                  defaultValue: "Delete",
                })}
              </Button>
            ) : null}
          </ListToolbarBulkActions>
        ) : null}
      </ListToolbarActions>
    </ListToolbar>
  );
}
