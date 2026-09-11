/**
 * A contacts taxonomy folder (`People`, `Organisations`) as an admin list.
 *
 * The host listing is the row identity (data paths). Contact fields are joined
 * by `recordId`. Search/sort/page stay on those joined rows — `/data/list`
 * has no search query, and the adapter already caps the folder at one page.
 */
import { useTranslation } from "@engenty/i18n/ui";
import {
  AdminListCardsView,
  AdminListTableView,
  Spinner,
  useListDisplayState,
} from "@engenty/ui-core";
import type { UiTabRenderProps } from "@engenty/ui-plugin-sdk";
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import type { ContactType } from "../../src/schema/index.js";
import type { ContactListItem } from "../api/contacts.js";
import { useContactsListQuery } from "../queries.js";
import { ContactsFolderEmpty } from "./space-data-contacts-folder-empty.js";
import type { ContactsFolderRow } from "./space-data-contacts-folder-table.js";
import { ContactsFolderListTable } from "./space-data-contacts-folder-table.js";
import {
  type ContactsFolderColumn,
  ContactsFolderListToolbar,
} from "./space-data-contacts-folder-toolbar.js";

const PAGE_SIZE = 200;

const DISPLAY_DEFAULTS = {
  columnOrder: ["name", "email"] as ContactsFolderColumn[],
  columnVisibility: { email: true, name: true },
  sortBy: "name" as const,
  sortOrder: "asc" as const,
  tableSize: "compact" as const,
  viewMode: "table" as const,
};

interface FolderEntry {
  name: string;
  path: string;
  recordId: string;
}

function isFolderEntry(value: unknown): value is FolderEntry {
  if (!value || typeof value !== "object") {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.name === "string" &&
    typeof entry.path === "string" &&
    typeof entry.recordId === "string"
  );
}

function typeOf(folderPath: string): ContactType | null {
  const last = folderPath.split("/").filter(Boolean).at(-1);
  if (last === "People") {
    return "person";
  }
  return last === "Organisations" ? "organisation" : null;
}

function pageRows<T>(
  rows: T[],
  page: number,
  pageSize: number
): { page: number; rows: T[]; total: number; totalPages: number } {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    rows: rows.slice(start, start + pageSize),
    total,
    totalPages,
  };
}

export function SpaceDataContactsFolderTab({ params }: UiTabRenderProps) {
  const { t } = useTranslation("contacts");
  const { spaceKey = "" } = useParams();
  const folderPath =
    typeof params.folderPath === "string" ? params.folderPath : "";
  const type = typeOf(folderPath);
  const entries = useMemo(
    () =>
      Array.isArray(params.entries) ? params.entries.filter(isFolderEntry) : [],
    [params.entries]
  );
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const display = useListDisplayState<
    ContactsFolderColumn,
    ContactsFolderColumn
  >({
    defaults: DISPLAY_DEFAULTS,
    storageKey: "space-data-contacts-folder",
    validSortColumns: ["name", "email"],
  });

  const query = useContactsListQuery({
    include_linked_invoice_counts: false,
    page: 1,
    pageSize: PAGE_SIZE,
    ...(type ? { type } : {}),
  });

  const joined = useMemo<ContactsFolderRow[]>(() => {
    const byId = new Map<string, ContactListItem>(
      (query.data?.data ?? []).map((contact) => [contact.id, contact])
    );
    const queryText = search.trim().toLowerCase();
    const rows = entries.map((entry) => {
      const contact = byId.get(entry.recordId);
      return {
        email: contact?.email ?? "",
        href: `/s/${encodeURIComponent(spaceKey)}/data?path=${encodeURIComponent(entry.path)}`,
        id: entry.recordId,
        name: contact?.display_name ?? entry.name,
      };
    });
    const filtered = queryText
      ? rows.filter((row) =>
          `${row.name} ${row.email}`.toLowerCase().includes(queryText)
        )
      : rows;
    const sorted = [...filtered].sort((left, right) => {
      const cmp = left[display.sortBy].localeCompare(right[display.sortBy]);
      return display.sortOrder === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [
    display.sortBy,
    display.sortOrder,
    entries,
    query.data,
    search,
    spaceKey,
  ]);

  const listing = pageRows(joined, page, display.pageSize);
  const onSortChange = (column: ContactsFolderColumn) => {
    if (display.sortBy === column) {
      display.setSortOrder(display.sortOrder === "asc" ? "desc" : "asc");
    } else {
      display.setSortBy(column);
      display.setSortOrder("asc");
    }
    setPage(1);
  };

  if (params.isPending === true) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Spinner />
      </div>
    );
  }

  const emptyFromSearch = entries.length > 0 && listing.total === 0;
  const pagination = {
    nextLabel: t("next"),
    onNext: () =>
      setPage((current) => Math.min(listing.totalPages, current + 1)),
    onPrevious: () => setPage((current) => Math.max(1, current - 1)),
    page: listing.page,
    pageOfLabel: t("pageOf", {
      page: listing.page,
      totalPages: listing.totalPages,
    }),
    previousLabel: t("previous"),
    totalPages: listing.totalPages,
  };

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-page">
      <div className="shrink-0">
        <ContactsFolderListToolbar
          columnOrder={display.columnOrder}
          columnVisibility={display.columnVisibility}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
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
          summary={t("spaceData.folder.summary", {
            count: listing.total,
            defaultValue: "{{count}}",
          })}
          tableSize={display.tableSize}
          viewMode={display.viewMode}
        />
      </div>
      {params.truncated === true ? (
        <p className="shrink-0 text-muted-foreground text-xs">
          {t("spaceData.folder.truncated", {
            defaultValue: "Showing the first page only.",
          })}
        </p>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {listing.total === 0 ? (
          <ContactsFolderEmpty
            hasSearch={emptyFromSearch}
            onClearSearch={() => {
              setSearch("");
              setPage(1);
            }}
          />
        ) : display.viewMode === "cards" ? (
          <AdminListCardsView
            pagination={listing.totalPages > 1 ? pagination : undefined}
          >
            <ContactsFolderListTable
              columnOrder={display.columnOrder}
              columnVisibility={display.columnVisibility}
              onSortChange={onSortChange}
              rows={listing.rows}
              sortBy={display.sortBy}
              sortOrder={display.sortOrder}
              tableSize={display.tableSize}
              viewMode="cards"
            />
          </AdminListCardsView>
        ) : (
          <AdminListTableView
            pagination={listing.totalPages > 1 ? pagination : undefined}
          >
            <ContactsFolderListTable
              columnOrder={display.columnOrder}
              columnVisibility={display.columnVisibility}
              onSortChange={onSortChange}
              rows={listing.rows}
              sortBy={display.sortBy}
              sortOrder={display.sortOrder}
              tableSize={display.tableSize}
              viewMode="table"
            />
          </AdminListTableView>
        )}
      </div>
    </section>
  );
}
