/**
 * A folder, listed — the fallback whenever no module claims its type.
 *
 * Deliberately a real list rather than a dashboard: a folder that nobody has
 * written a view for is its children, and the admin list chrome (search, table
 * or cards, sort, paging) is the same shape every other record list in the
 * product uses. The rows stay LINKS so the page is navigable without the tree.
 */
import { useTranslation } from "@engenty/i18n/ui";
import {
  AdminListCardsView,
  AdminListTableView,
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Spinner,
  useListDisplayState,
  useTableSelection,
} from "@engenty/ui-core";
import { useMemo, useState } from "react";
import { useFolderListBulk } from "./folder-list-bulk";
import { FolderListCards } from "./folder-list-cards";
import {
  applyFolderList,
  FOLDER_LIST_COLUMNS,
  FOLDER_LIST_DISPLAY_DEFAULTS,
  type FolderChildRow,
  type FolderListColumn,
  type FolderListSortColumn,
  isFolderRowSelectable,
} from "./folder-list-model";
import { FolderListTable } from "./folder-list-table";
import { FolderListToolbar } from "./folder-list-toolbar";

export function FolderOverview({
  children,
  defaults = FOLDER_LIST_DISPLAY_DEFAULTS,
  description,
  isPending,
  layout = "page",
  spaceId = null,
  storageKey = "space-data-folder",
  truncated,
}: {
  children: FolderChildRow[];
  defaults?: typeof FOLDER_LIST_DISPLAY_DEFAULTS;
  description?: string | undefined;
  isPending: boolean;
  /** `plain` sits inside a padded hub; `page` is the folder pane. */
  layout?: "page" | "plain";
  spaceId?: string | null;
  storageKey?: string;
  truncated?: boolean;
}) {
  const { t } = useTranslation("common");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const display = useListDisplayState<FolderListColumn, FolderListSortColumn>({
    defaults,
    storageKey,
    validSortColumns: FOLDER_LIST_COLUMNS,
  });

  const listing = useMemo(
    () =>
      applyFolderList(children, {
        page,
        pageSize: display.pageSize,
        search,
        sortBy: display.sortBy,
        sortOrder: display.sortOrder,
      }),
    [
      children,
      display.pageSize,
      display.sortBy,
      display.sortOrder,
      page,
      search,
    ]
  );

  const selectionEnabled = Boolean(spaceId);
  const selection = useTableSelection({
    isSelectable: isFolderRowSelectable,
    items: listing.rows,
  });
  const bulk = useFolderListBulk({
    onCleared: selection.clearSelection,
    rows: children,
    selectedIds: selection.selectedIds,
    spaceId,
  });
  const listSelection = selectionEnabled
    ? {
        allSelected: selection.allSelected,
        onSelectAll: selection.handleSelectAll,
        onSelectOne: selection.handleSelectOne,
        selectedIds: selection.selectedIds,
        someSelected: selection.someSelected,
      }
    : undefined;

  const onSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };
  const onSortChange = (column: FolderListSortColumn) => {
    if (display.sortBy === column) {
      display.setSortOrder(display.sortOrder === "asc" ? "desc" : "asc");
    } else {
      display.setSortBy(column);
      display.setSortOrder(column === "updatedAt" ? "desc" : "asc");
    }
    setPage(1);
  };

  if (isPending) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Spinner />
      </div>
    );
  }

  const pagination = {
    nextLabel: t("spaces.data.list.next", { defaultValue: "Next" }),
    onNext: () =>
      setPage((current) => Math.min(listing.totalPages, current + 1)),
    onPrevious: () => setPage((current) => Math.max(1, current - 1)),
    page: listing.page,
    pageOfLabel: t("spaces.data.list.pageOf", {
      defaultValue: "Page {{page}} of {{totalPages}}",
      page: listing.page,
      totalPages: listing.totalPages,
    }),
    previousLabel: t("spaces.data.list.previous", {
      defaultValue: "Previous",
    }),
    totalPages: listing.totalPages,
  };
  const emptyFromSearch = children.length > 0 && listing.total === 0;

  return (
    <section
      className={
        layout === "plain"
          ? "flex min-h-0 flex-col gap-3"
          : "flex h-full min-h-0 flex-col gap-3 overflow-hidden p-page"
      }
    >
      {description ? (
        <p className="max-w-prose shrink-0 text-muted-foreground text-sm">
          {description}
        </p>
      ) : null}
      <div className="shrink-0">
        <FolderListToolbar
          {...(selectionEnabled
            ? {
                bulk: {
                  canDelete: bulk.canDelete,
                  canMove: bulk.canMove,
                  onClearSelection: selection.clearSelection,
                  onDelete: bulk.openDelete,
                  onMove: bulk.openMove,
                  pending: bulk.pending,
                  selectedCount: selection.selectedIds.size,
                },
              }
            : {})}
          columnOrder={display.columnOrder}
          columnVisibility={display.columnVisibility}
          onSearchChange={onSearchChange}
          searchQuery={search}
          setColumnOrder={display.setColumnOrder}
          setColumnVisibility={display.setColumnVisibility}
          setSortBy={(column) => {
            display.setSortBy(column);
            setPage(1);
          }}
          setSortOrder={(order) => {
            display.setSortOrder(order);
            setPage(1);
          }}
          setTableSize={display.setTableSize}
          setViewMode={display.setViewMode}
          sortBy={display.sortBy}
          sortOrder={display.sortOrder}
          summary={t("spaces.data.list.summary", {
            count: listing.total,
            defaultValue: "{{count}}",
          })}
          tableSize={display.tableSize}
          viewMode={display.viewMode}
        />
      </div>
      {truncated ? (
        <p className="shrink-0 text-muted-foreground text-xs">
          {t("spaces.data.truncated", {
            defaultValue: "Showing the first results only.",
          })}
        </p>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {listing.total === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon" />
              <EmptyTitle>
                {emptyFromSearch
                  ? t("spaces.data.list.noResults", {
                      defaultValue: "No matching items",
                    })
                  : t("spaces.data.emptyFolder", { defaultValue: "Empty." })}
              </EmptyTitle>
              {emptyFromSearch ? (
                <EmptyDescription>
                  {t("spaces.data.list.noResultsHint", {
                    defaultValue: "Try a different search.",
                  })}
                </EmptyDescription>
              ) : null}
            </EmptyHeader>
            {emptyFromSearch ? (
              <EmptyContent>
                <Button onClick={() => onSearchChange("")} variant="outline">
                  {t("spaces.data.list.clearSearch", {
                    defaultValue: "Clear search",
                  })}
                </Button>
              </EmptyContent>
            ) : null}
          </Empty>
        ) : display.viewMode === "cards" ? (
          <AdminListCardsView
            pagination={listing.totalPages > 1 ? pagination : undefined}
          >
            <FolderListCards
              rows={listing.rows}
              {...(listSelection ? { selection: listSelection } : {})}
              tableSize={display.tableSize}
            />
          </AdminListCardsView>
        ) : (
          <AdminListTableView
            pagination={listing.totalPages > 1 ? pagination : undefined}
          >
            <FolderListTable
              columnOrder={display.columnOrder}
              columnVisibility={display.columnVisibility}
              onSortChange={onSortChange}
              rows={listing.rows}
              {...(listSelection ? { selection: listSelection } : {})}
              sortBy={display.sortBy}
              sortOrder={display.sortOrder}
              tableSize={display.tableSize}
            />
          </AdminListTableView>
        )}
      </div>
      {selectionEnabled ? bulk.dialogs : null}
    </section>
  );
}
