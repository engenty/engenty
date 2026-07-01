import type { SortOrder, TableSize, ViewMode } from "@engenty/ui-core";
import {
  AdminListCardsView,
  AdminListTableView,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@engenty/ui-core";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { NavigateFunction } from "react-router-dom";
import type { ContactListItem } from "../api.js";
import { ContactsCards } from "./contacts-cards.js";
import type {
  ContactsColumnVisibility,
  ContactsSortColumn,
} from "./contacts-display-dialog.js";
import { ContactsTable } from "./contacts-table.js";

type TranslateFn = (
  key: string,
  options?: Record<string, string | number> & { defaultValue?: string }
) => string;

export interface ContactsListMainProps {
  columnOrder: (keyof ContactsColumnVisibility)[];
  columnVisibility: ContactsColumnVisibility;
  entities: ContactListItem[];
  error: string | null;
  /** Rendered inside the card surface above the scroll area (toolbar row). */
  header?: ReactNode;
  isLoading: boolean;
  navigate: NavigateFunction;
  onSelectAll: () => void;
  onSelectOne: (id: string, selected: boolean) => void;
  onSortChange: (column: ContactsSortColumn) => void;
  page: number;
  selectedIds: Set<string>;
  setPage: Dispatch<SetStateAction<number>>;
  sortBy: ContactsSortColumn;
  sortOrder: SortOrder;
  t: TranslateFn;
  tableSize: TableSize;
  totalPages: number;
  viewMode: ViewMode;
}

export function ContactsListMain(props: ContactsListMainProps) {
  const {
    columnOrder,
    columnVisibility,
    entities,
    error,
    header,
    isLoading,
    navigate,
    onSelectAll,
    onSelectOne,
    onSortChange,
    page,
    selectedIds,
    setPage,
    sortBy,
    sortOrder,
    t,
    tableSize,
    totalPages,
    viewMode,
  } = props;

  const pagination = {
    nextLabel: t("next"),
    onNext: () => setPage((prev) => Math.min(totalPages, prev + 1)),
    onPrevious: () => setPage((prev) => Math.max(1, prev - 1)),
    page,
    pageOfLabel: t("pageOf", { page, totalPages }),
    previousLabel: t("previous"),
    totalPages,
  };

  if (isLoading) {
    return (
      <AdminListTableView header={header}>
        <Table>
          <TableHeader>
            <TableRow>
              {columnOrder
                .filter((k) => columnVisibility[k])
                .map((key) => (
                  <TableHead key={key}>
                    <Skeleton className="h-4 w-20" />
                  </TableHead>
                ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 8 }, (_, i) => `skeleton-${i}`).map(
              (rowKey) => (
                <TableRow key={rowKey}>
                  {columnOrder
                    .filter((k) => columnVisibility[k])
                    .map((key) => (
                      <TableCell key={key}>
                        <Skeleton
                          className={
                            key === "displayName" ? "h-4 w-32" : "h-5 w-24"
                          }
                        />
                      </TableCell>
                    ))}
                </TableRow>
              )
            )}
          </TableBody>
        </Table>
      </AdminListTableView>
    );
  }

  if (error) {
    return (
      <AdminListTableView header={header}>
        <div className="p-4 text-red-700 text-sm dark:text-red-300">
          {t("loadFailedWithError", { error })}
        </div>
      </AdminListTableView>
    );
  }

  if (entities.length === 0) {
    return (
      <AdminListTableView header={header} pagination={pagination}>
        <p className="p-4 text-muted-foreground text-sm">{t("noEntities")}</p>
      </AdminListTableView>
    );
  }

  if (viewMode === "cards") {
    return (
      <AdminListCardsView header={header} pagination={pagination}>
        <ContactsCards
          entities={entities}
          onCardClick={(entity) => navigate(`/mdl/contacts/${entity.id}`)}
          tableSize={tableSize}
        />
      </AdminListCardsView>
    );
  }

  return (
    <AdminListTableView
      header={header}
      pagination={pagination}
      scrollClassName="scrollbar-width-[none] overscroll-y-none"
    >
      <ContactsTable
        columnOrder={columnOrder}
        columnVisibility={columnVisibility}
        entities={entities}
        onRowClick={(entity) => navigate(`/mdl/contacts/${entity.id}`)}
        onSelectAll={onSelectAll}
        onSelectOne={onSelectOne}
        onSortChange={onSortChange}
        selectedIds={selectedIds}
        sortBy={sortBy}
        sortOrder={sortOrder}
        tableSize={tableSize}
      />
    </AdminListTableView>
  );
}
