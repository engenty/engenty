/**
 * An offers STATUS folder as an admin list in the space Data pane.
 *
 * `Offers/draft` is a pipeline stage. The host listing keeps each node's data
 * path; offer fields are joined by `recordId`. Search/sort/page run on those
 * joined rows because `/data/list` has no search query.
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
import type { OfferListItem, OfferStatus } from "../api.js";
import { formatDate } from "../lib/offer-format.js";
import { useOffersListQuery } from "../queries.js";

const PAGE_SIZE = 200;
const LIST_PAGE = 25;

interface FolderEntry {
  name: string;
  path: string;
  recordId: string;
}

type SortColumn = "client" | "date" | "number" | "title" | "validUntil";

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

function statusOf(folderPath: string): OfferStatus | null {
  const last = folderPath.split("/").filter(Boolean).at(-1);
  return last === "draft" || last === "ready" || last === "accepted"
    ? last
    : null;
}

export function SpaceDataOffersFolderTab({ params }: UiTabRenderProps) {
  const { t } = useTranslation("offers");
  const { spaceKey = "" } = useParams();
  const folderPath =
    typeof params.folderPath === "string" ? params.folderPath : "";
  const status = statusOf(folderPath);
  const entries = useMemo(
    () =>
      Array.isArray(params.entries) ? params.entries.filter(isFolderEntry) : [],
    [params.entries]
  );
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortColumn>("number");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const query = useOffersListQuery({
    page: 1,
    pageSize: PAGE_SIZE,
    ...(status ? { status } : {}),
  });

  const rows = useMemo(() => {
    const byId = new Map<string, OfferListItem>(
      (query.data?.data ?? []).map((offer) => [offer.id, offer])
    );
    const queryText = search.trim().toLowerCase();
    const joined = entries.map((entry) => {
      const offer = byId.get(entry.recordId) ?? null;
      return {
        client: offer?.recipient_name ?? "",
        date: offer?.offer_date ?? "",
        entry,
        href: `/s/${encodeURIComponent(spaceKey)}/data?path=${encodeURIComponent(entry.path)}`,
        number: offer?.offer_number ?? entry.name,
        offer,
        title: offer?.title ?? "",
        validUntil: offer?.valid_until ?? "",
      };
    });
    const filtered = queryText
      ? joined.filter((row) =>
          `${row.number} ${row.title} ${row.client}`
            .toLowerCase()
            .includes(queryText)
        )
      : joined;
    const sorted = [...filtered].sort((left, right) => {
      const cmp = left[sortBy].localeCompare(right[sortBy]);
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

  const emptyFromSearch = entries.length > 0 && rows.total === 0;
  const onSort = (column: SortColumn) => {
    if (sortBy === column) {
      setSortOrder((order) => (order === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortOrder("asc");
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
                  defaultValue: "Search offers…",
                })}
                value={search}
                wrapperClassName="w-full"
              />
            </ListToolbarSearch>
            <ListToolbarSummary>
              {t("spaceData.folder.summary", {
                count: rows.total,
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
        {rows.total === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon" />
              <EmptyTitle>
                {emptyFromSearch
                  ? t("spaceData.folder.noResults", {
                      defaultValue: "No matching offers",
                    })
                  : t("spaceData.folder.empty", {
                      defaultValue: "No offers in this stage.",
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
              rows.totalPages > 1
                ? {
                    nextLabel: t("next"),
                    onNext: () =>
                      setPage((current) =>
                        Math.min(rows.totalPages, current + 1)
                      ),
                    onPrevious: () =>
                      setPage((current) => Math.max(1, current - 1)),
                    page: rows.page,
                    pageOfLabel: t("pageOf", {
                      page: rows.page,
                      totalPages: rows.totalPages,
                    }),
                    previousLabel: t("previous"),
                    totalPages: rows.totalPages,
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
                    column="title"
                    compact
                    onSort={onSort}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                  >
                    {t("spaceData.folder.title", { defaultValue: "Title" })}
                  </TableSortableHeader>
                  <TableSortableHeader<SortColumn>
                    column="client"
                    compact
                    onSort={onSort}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                  >
                    {t("spaceData.folder.client", { defaultValue: "Client" })}
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
                    column="validUntil"
                    compact
                    onSort={onSort}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                  >
                    {t("spaceData.folder.validUntil", {
                      defaultValue: "Valid until",
                    })}
                  </TableSortableHeader>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.rows.map((row) => (
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
                      {row.title || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.client || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatDate(row.offer?.offer_date ?? null)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "tabular-nums",
                        row.offer?.valid_until &&
                          new Date(row.offer.valid_until).getTime() < Date.now()
                          ? "text-destructive"
                          : "text-muted-foreground"
                      )}
                    >
                      {formatDate(row.offer?.valid_until ?? null)}
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
