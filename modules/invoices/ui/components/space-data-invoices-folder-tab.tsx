/**
 * An invoices STATUS folder as an admin list in the space Data pane.
 *
 * The host listing keeps each node's data path; invoice fields are joined by
 * `recordId`. Search/sort/page run on those joined rows.
 */
import { useTranslation } from "@engenty/i18n/ui";
import {
  AdminListTableView,
  Button,
  cn,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  ListSearchInput,
  ListToolbar,
  ListToolbarMainArea,
  ListToolbarSearch,
  ListToolbarSummary,
  Spinner,
  STICKY_HEADER_CLASS,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableSortableHeader,
} from "@engenty/ui-core";
import type { UiTabRenderProps } from "@engenty/ui-plugin-sdk";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { InvoiceListItem } from "../api.js";
import { isInvoiceOverdue } from "../lib/invoice-overdue.js";
import { invoiceRecipientName } from "../lib/invoice-recipient.js";
import { useInvoicesListQuery } from "../queries.js";

const LIST_PAGE = 25;

interface FolderEntry {
  name: string;
  path: string;
  recordId: string;
}

type SortColumn = "date" | "due" | "number" | "recipient" | "total";

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

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString();
}

function formatMoney(value: number | undefined, currency: string): string {
  return typeof value === "number"
    ? new Intl.NumberFormat(undefined, { currency, style: "currency" }).format(
        value
      )
    : "—";
}

export function SpaceDataInvoicesFolderTab({ params }: UiTabRenderProps) {
  const { t } = useTranslation("invoices");
  const { spaceKey = "" } = useParams();
  const entries = useMemo(
    () =>
      Array.isArray(params.entries) ? params.entries.filter(isFolderEntry) : [],
    [params.entries]
  );
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortColumn>("number");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const query = useInvoicesListQuery();

  const listing = useMemo(() => {
    const byId = new Map<string, InvoiceListItem>(
      (query.data ?? []).map((invoice) => [invoice.id, invoice])
    );
    const queryText = search.trim().toLowerCase();
    const joined = entries.map((entry) => {
      const invoice = byId.get(entry.recordId) ?? null;
      const recipient = invoice ? (invoiceRecipientName(invoice) ?? "") : "";
      return {
        date: invoice?.date ?? "",
        due: invoice?.dueDate ?? "",
        entry,
        href: `/s/${encodeURIComponent(spaceKey)}/data?path=${encodeURIComponent(entry.path)}`,
        invoice,
        number: invoice?.number ?? entry.name,
        recipient,
        total: invoice?.sumBrutto ?? 0,
      };
    });
    const filtered = queryText
      ? joined.filter((row) =>
          `${row.number} ${row.recipient}`.toLowerCase().includes(queryText)
        )
      : joined;
    const sorted = [...filtered].sort((left, right) => {
      const cmp =
        sortBy === "total"
          ? left.total - right.total
          : left[sortBy].localeCompare(right[sortBy]);
      return sortOrder === "asc" ? cmp : -cmp;
    });
    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / LIST_PAGE));
    const safePage = Math.min(Math.max(1, page), totalPages);
    return {
      page: safePage,
      rows: sorted.slice((safePage - 1) * LIST_PAGE, safePage * LIST_PAGE),
      total,
      totalPages,
    };
  }, [entries, page, query.data, search, sortBy, sortOrder, spaceKey]);

  if (params.isPending === true) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Spinner />
      </div>
    );
  }

  const emptyFromSearch = entries.length > 0 && listing.total === 0;
  const onSort = (column: SortColumn) => {
    if (sortBy === column) {
      setSortOrder((order) => (order === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortOrder(column === "date" || column === "due" ? "desc" : "asc");
    }
    setPage(1);
  };

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-page">
      <div className="shrink-0">
        <ListToolbar>
          <ListToolbarMainArea>
            <ListToolbarSearch>
              <ListSearchInput
                className="w-full"
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder={t("spaceData.folder.searchPlaceholder", {
                  defaultValue: "Search invoices…",
                })}
                value={search}
                wrapperClassName="w-full"
              />
            </ListToolbarSearch>
            <ListToolbarSummary>
              {t("spaceData.folder.summary", {
                count: listing.total,
                defaultValue: "{{count}}",
              })}
            </ListToolbarSummary>
          </ListToolbarMainArea>
        </ListToolbar>
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
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon" />
              <EmptyTitle>
                {emptyFromSearch
                  ? t("spaceData.folder.noResults", {
                      defaultValue: "No matching invoices",
                    })
                  : t("spaceData.folder.empty", {
                      defaultValue: "No invoices in this state.",
                    })}
              </EmptyTitle>
              {emptyFromSearch ? (
                <EmptyDescription>
                  {t("spaceData.folder.noResultsHint", {
                    defaultValue: "Try a different search.",
                  })}
                </EmptyDescription>
              ) : null}
            </EmptyHeader>
            {emptyFromSearch ? (
              <EmptyContent>
                <Button
                  onClick={() => {
                    setSearch("");
                    setPage(1);
                  }}
                  variant="outline"
                >
                  {t("spaceData.folder.clearSearch", {
                    defaultValue: "Clear search",
                  })}
                </Button>
              </EmptyContent>
            ) : null}
          </Empty>
        ) : (
          <AdminListTableView
            pagination={
              listing.totalPages > 1
                ? {
                    nextLabel: t("next"),
                    onNext: () =>
                      setPage((current) =>
                        Math.min(listing.totalPages, current + 1)
                      ),
                    onPrevious: () =>
                      setPage((current) => Math.max(1, current - 1)),
                    page: listing.page,
                    pageOfLabel: t("pageOf", {
                      page: listing.page,
                      totalPages: listing.totalPages,
                    }),
                    previousLabel: t("previous"),
                    totalPages: listing.totalPages,
                  }
                : undefined
            }
          >
            <Table noWrapper>
              <TableHeader className={STICKY_HEADER_CLASS}>
                <TableRow className="group [&>th]:!py-1.5 border-b-0 hover:bg-transparent">
                  <TableSortableHeader<SortColumn>
                    column="number"
                    compact
                    onSort={onSort}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                  >
                    {t("spaceData.folder.number", { defaultValue: "Number" })}
                  </TableSortableHeader>
                  <TableSortableHeader<SortColumn>
                    column="recipient"
                    compact
                    onSort={onSort}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                  >
                    {t("spaceData.folder.recipient", {
                      defaultValue: "Recipient",
                    })}
                  </TableSortableHeader>
                  <TableSortableHeader<SortColumn>
                    column="date"
                    compact
                    onSort={onSort}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                  >
                    {t("spaceData.folder.date", { defaultValue: "Date" })}
                  </TableSortableHeader>
                  <TableSortableHeader<SortColumn>
                    column="due"
                    compact
                    onSort={onSort}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                  >
                    {t("spaceData.folder.due", { defaultValue: "Due" })}
                  </TableSortableHeader>
                  <TableSortableHeader<SortColumn>
                    className="text-right"
                    column="total"
                    compact
                    onSort={onSort}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                  >
                    {t("spaceData.folder.total", { defaultValue: "Total" })}
                  </TableSortableHeader>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listing.rows.map((row) => (
                  <TableRow
                    className="group [&>td]:!py-1.5"
                    key={row.entry.recordId}
                  >
                    <TableCell>
                      <Link
                        className="font-medium hover:underline"
                        to={row.href}
                      >
                        {row.number}
                      </Link>
                    </TableCell>
                    <TableCell className="min-w-0 max-w-xs truncate">
                      {row.recipient || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatDate(row.invoice?.date)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "tabular-nums",
                        isInvoiceOverdue(row.invoice)
                          ? "font-medium text-destructive"
                          : "text-muted-foreground"
                      )}
                    >
                      {formatDate(row.invoice?.dueDate)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(
                        row.invoice?.sumBrutto,
                        row.invoice?.currency ?? "EUR"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AdminListTableView>
        )}
      </div>
    </section>
  );
}
