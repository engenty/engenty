/**
 * Admin FAQ list — /mdl/knowledge-base/faqs
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  AdminListCardsView,
  AdminListTableView,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  ListFilterSelectTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useListDisplayState,
  useTableSelection,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { HelpCircle, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import type { FaqSortColumn, FaqStatus } from "../../src/schema/shared.js";
import type { Faq } from "../../src/schema/types.js";
import { FaqsCards } from "../components/faqs-cards.js";
import { FaqsTable } from "../components/faqs-table.js";
import {
  type FaqsColumnVisibility,
  FaqsTableToolbar,
} from "../components/faqs-table-toolbar.js";
import { KbModuleShellActions } from "../components/kb-module-shell-actions.js";
import { useKbFaqsListAgentUiSlice } from "../hooks/use-kb-agent-ui-slice-content.js";
import { useKbModuleSecondaryShellNav } from "../hooks/use-kb-module-secondary-shell-nav.js";
import { kbDisplayName } from "../kb-display-name.js";
import {
  KB_FAQS_LIST_PATH,
  kbFaqPath,
  kbFaqsListPath,
  kbNewFaqEditPath,
} from "../kb-paths.js";
import { getFaqsToolbarLabels } from "../lib/faqs-toolbar-labels.js";
import { kbModulePageListShellSectionClassName } from "../lib/kb-page-shell.js";
import {
  kbSettingsQueryOptions,
  kbsQueryOptions,
  useDeleteFaqMutation,
  useFaqsListQuery,
  useUpdateFaqMutation,
} from "../queries.js";
import {
  kbIdFromSlug,
  resolveKbIdFromUrl,
  slugFromKbId,
  tenantDefaultKbId,
} from "../resolve-kb-id.js";

const FAQS_DISPLAY_DEFAULTS = {
  viewMode: "table" as const,
  tableSize: "normal" as const,
  sortBy: "sort_order" as FaqSortColumn,
  sortOrder: "asc" as const,
  columnVisibility: {
    question: true,
    status: true,
    sortOrder: true,
    tags: true,
    createdAt: false,
    updatedAt: true,
  } satisfies FaqsColumnVisibility,
  columnOrder: [
    "question",
    "status",
    "sortOrder",
    "tags",
    "updatedAt",
    "createdAt",
  ] as (keyof FaqsColumnVisibility)[],
};

function faqListSearchQuery(searchText: string): string {
  const p = new URLSearchParams();
  if (searchText.trim()) {
    p.set("search", searchText.trim());
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function FaqListPage() {
  const { t } = useTranslation("kb");
  const navigate = useNavigate();
  const location = useLocation();
  const { kbSlug: kbSlugParam } = useParams<{ kbSlug?: string }>();
  const [searchParams] = useSearchParams();

  const [search, setSearch] = useState("");
  const qFromUrl = searchParams.get("search");
  useEffect(() => {
    if (qFromUrl) {
      setSearch(qFromUrl);
    }
  }, [qFromUrl]);

  const { data: kbs = [], isLoading: kbsLoading } = useQuery(kbsQueryOptions);
  const { data: kbSettings } = useQuery(kbSettingsQueryOptions);
  const tenantDefault = tenantDefaultKbId(kbSettings);
  const kbId = useMemo(() => {
    if (kbSlugParam?.trim()) {
      return kbIdFromSlug(kbs, kbSlugParam);
    }
    return resolveKbIdFromUrl(searchParams, kbs, tenantDefault);
  }, [kbSlugParam, searchParams, kbs, tenantDefault]);

  const kbSlug = useMemo(() => slugFromKbId(kbs, kbId), [kbs, kbId]);

  useEffect(() => {
    if (kbsLoading || !kbs.length || !kbId) {
      return;
    }
    const slug = slugFromKbId(kbs, kbId);
    if (!slug) {
      return;
    }
    if (kbSlugParam) {
      return;
    }
    if (location.pathname === KB_FAQS_LIST_PATH) {
      navigate(`${kbFaqsListPath(slug)}${faqListSearchQuery(search)}`, {
        replace: true,
      });
    }
  }, [kbsLoading, kbs, kbId, kbSlugParam, location.pathname, navigate, search]);

  const navigateKb = useCallback(
    (nextKbId: string) => {
      const nextSlug = slugFromKbId(kbs, nextKbId);
      if (!nextSlug) {
        return;
      }
      navigate(`${kbFaqsListPath(nextSlug)}${faqListSearchQuery(search)}`);
    },
    [kbs, navigate, search]
  );

  const kbShellNav = useKbModuleSecondaryShellNav({
    kbId,
    kbSlug: kbSlug ?? "",
    onKbChange: navigateKb,
  });

  usePageConfig({
    topbarChrome: "contentBlend",
    contentStackBackground: "paper",
    actions: kbSlug ? <KbModuleShellActions kbSlug={kbSlug} /> : null,
    breadcrumbs: [
      ...(kbShellNav.kbRootCrumb ? [kbShellNav.kbRootCrumb] : []),
      { label: t("faq.title") },
    ],
    secondaryNavAfterItems: kbShellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: kbShellNav.secondaryNavHeaderSlot,
  });

  const display = useListDisplayState<
    keyof FaqsColumnVisibility,
    FaqSortColumn
  >({
    storageKey: "kb-faqs",
    defaults: FAQS_DISPLAY_DEFAULTS,
    validSortColumns: [
      "question",
      "created_at",
      "updated_at",
      "sort_order",
      "status",
    ],
  });

  const {
    sortBy,
    sortOrder,
    viewMode,
    tableSize,
    columnVisibility,
    columnOrder,
    setSortBy,
    setSortOrder,
  } = display;

  const [page, setPage] = useState(1);
  const pageSize = 25;

  const listQuery = useMemo(
    () => ({
      kb_id: kbId,
      page,
      page_size: pageSize,
      search: search.trim() || undefined,
      sort_by: sortBy,
      sort_order: sortOrder,
    }),
    [kbId, page, pageSize, search, sortBy, sortOrder]
  );

  const {
    data: listData,
    isLoading: loading,
    error: listError,
    refetch: refetchList,
  } = useFaqsListQuery(listQuery);

  const faqs = listData?.data ?? [];
  const total = listData?.total ?? 0;
  const error = listError
    ? listError instanceof Error
      ? listError.message
      : "Failed to load FAQs"
    : null;

  useKbFaqsListAgentUiSlice({ faqs, search, total });

  const deleteMutation = useDeleteFaqMutation(listQuery);
  const updateMutation = useUpdateFaqMutation(listQuery);

  const selection = useTableSelection({ items: faqs });
  const { selectedIds, handleSelectAll, handleSelectOne, clearSelection } =
    selection;

  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<FaqStatus>("draft");
  const [bulkStatusBusy, setBulkStatusBusy] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleSearchChange = useCallback((value: string) => {
    setPage(1);
    setSearch(value);
  }, []);

  const handleSortByChange = useCallback(
    (value: FaqSortColumn) => {
      setPage(1);
      display.setSortBy(value);
    },
    [display]
  );

  const handleSortOrderChange = useCallback(
    (value: "asc" | "desc") => {
      setPage(1);
      setSortOrder(value);
    },
    [setSortOrder]
  );

  const handleSortChange = useCallback(
    (column: FaqSortColumn) => {
      setPage(1);
      if (sortBy === column) {
        setSortOrder(sortOrder === "asc" ? "desc" : "asc");
      } else {
        setSortBy(column);
      }
    },
    [sortBy, sortOrder, setSortBy, setSortOrder]
  );

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      return;
    }
    setBulkDeleting(true);
    try {
      await Promise.all(ids.map((id) => deleteMutation.mutateAsync(id)));
      clearSelection();
      await refetchList();
    } finally {
      setBulkDeleting(false);
    }
  }, [selectedIds, clearSelection, deleteMutation, refetchList]);

  const handleApplyBulkStatus = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      return;
    }
    setBulkStatusBusy(true);
    try {
      await Promise.all(
        ids.map((id) =>
          updateMutation.mutateAsync({ id, input: { status: bulkStatus } })
        )
      );
      clearSelection();
      setBulkStatusOpen(false);
      await refetchList();
    } finally {
      setBulkStatusBusy(false);
    }
  }, [selectedIds, bulkStatus, updateMutation, clearSelection, refetchList]);

  const toolbarLabels = useMemo(
    () => getFaqsToolbarLabels(t, total),
    [t, total]
  );

  const bulkActions =
    selectedIds.size > 0 ? (
      <>
        <Button
          className="h-8 gap-1.5"
          onClick={() => setBulkStatusOpen(true)}
          size="sm"
          variant="outline"
        >
          {t("list.set_status", { count: selectedIds.size })}
        </Button>
        <Button
          className="h-8 gap-1.5"
          disabled={bulkDeleting}
          onClick={() => handleBulkDelete()}
          size="sm"
          variant="destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t("list.delete_selected", { count: selectedIds.size })}
        </Button>
      </>
    ) : null;

  if (kbsLoading) {
    return (
      <section className={kbModulePageListShellSectionClassName}>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-1">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-9 w-24" />
          </div>
          <Skeleton className="min-h-0 flex-1 rounded-lg border bg-card" />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="flex items-center justify-center p-8">
        <div className="rounded-md border border-red-300/40 bg-red-100/10 p-3 text-red-700 text-sm dark:text-red-300">
          {error}
        </div>
      </section>
    );
  }

  const pagination = {
    nextLabel: t("list.next"),
    onNext: () => setPage((value) => Math.min(totalPages, value + 1)),
    onPrevious: () => setPage((value) => Math.max(1, value - 1)),
    page,
    pageOfLabel: t("list.page_of", { page, totalPages }),
    previousLabel: t("list.previous"),
    totalPages,
  };

  const toolbarHeader = (
    <>
      <Select
        onValueChange={(v) => {
          setPage(1);
          navigateKb(v);
        }}
        value={kbId || undefined}
      >
        <ListFilterSelectTrigger className="w-[220px]">
          <SelectValue placeholder={t("list.kb_placeholder")}>
            {kbs.find((kb) => kb.id === kbId)
              ? kbDisplayName(kbs.find((kb) => kb.id === kbId)!, t)
              : null}
          </SelectValue>
        </ListFilterSelectTrigger>
        <SelectContent>
          {kbs.map((kb) => (
            <SelectItem key={kb.id} value={kb.id}>
              {kbDisplayName(kb, t)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FaqsTableToolbar
        bulkActions={bulkActions}
        clearSelectionLabel={t("list.clear_selection")}
        columnOrder={columnOrder}
        columnVisibility={columnVisibility}
        labels={toolbarLabels}
        onClearSelection={clearSelection}
        onSearchChange={handleSearchChange}
        onSortByChange={handleSortByChange}
        onSortOrderChange={handleSortOrderChange}
        searchQuery={search}
        selectedCount={selectedIds.size}
        setColumnOrder={display.setColumnOrder}
        setColumnVisibility={display.setColumnVisibility}
        setTableSize={display.setTableSize}
        setViewMode={display.setViewMode}
        sortBy={sortBy}
        sortOrder={sortOrder}
        tableSize={tableSize}
        viewMode={viewMode}
      />
    </>
  );

  return (
    <section className={kbModulePageListShellSectionClassName}>
      <Dialog onOpenChange={setBulkStatusOpen} open={bulkStatusOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>{t("list.bulk_faq_status_title")}</DialogTitle>
            <DialogDescription>
              {t("list.bulk_faq_status_description")}
            </DialogDescription>
          </DialogHeader>
          <Select
            onValueChange={(v) => setBulkStatus(v as FaqStatus)}
            value={bulkStatus}
          >
            <SelectTrigger>
              <SelectValue>
                {bulkStatus === "draft"
                  ? t("article.status.draft")
                  : bulkStatus === "published"
                    ? t("article.status.published")
                    : t("article.status.archived")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">{t("article.status.draft")}</SelectItem>
              <SelectItem value="published">
                {t("article.status.published")}
              </SelectItem>
              <SelectItem value="archived">
                {t("article.status.archived")}
              </SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button onClick={() => setBulkStatusOpen(false)} variant="outline">
              {t("actions.cancel")}
            </Button>
            <Button
              disabled={bulkStatusBusy}
              onClick={() => handleApplyBulkStatus()}
            >
              {t("list.bulk_status_apply")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {loading && (
        <AdminListTableView header={toolbarHeader}>
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
              {Array.from({ length: 8 }, (_, i) => `sk-${i}`).map((rowKey) => (
                <TableRow key={rowKey}>
                  {columnOrder
                    .filter((k) => columnVisibility[k])
                    .map((key) => (
                      <TableCell key={key}>
                        <Skeleton
                          className={
                            key === "question" ? "h-4 w-32" : "h-5 w-24"
                          }
                        />
                      </TableCell>
                    ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AdminListTableView>
      )}

      {!loading && faqs.length > 0 && viewMode === "table" && (
        <AdminListTableView header={toolbarHeader} pagination={pagination}>
          <FaqsTable
            columnOrder={columnOrder}
            columnVisibility={columnVisibility}
            faqs={faqs}
            onDataChange={() => refetchList()}
            onRowClick={(faq: Faq) =>
              kbSlug ? navigate(kbFaqPath(kbSlug, faq.id)) : undefined
            }
            onSelectAll={handleSelectAll}
            onSelectOne={handleSelectOne}
            onSortChange={handleSortChange}
            selectedIds={selectedIds}
            sortBy={sortBy}
            sortOrder={sortOrder}
            tableSize={tableSize}
          />
        </AdminListTableView>
      )}

      {!loading && faqs.length > 0 && viewMode === "cards" && (
        <AdminListCardsView header={toolbarHeader}>
          <FaqsCards
            faqs={faqs}
            onCardClick={(faq) =>
              kbSlug ? navigate(kbFaqPath(kbSlug, faq.id)) : undefined
            }
            tableSize={tableSize}
          />
        </AdminListCardsView>
      )}

      {!loading && faqs.length === 0 && (
        <AdminListTableView header={toolbarHeader} pagination={pagination}>
          <Empty>
            <EmptyMedia>
              <HelpCircle className="h-16 w-16 text-muted-foreground/30" />
            </EmptyMedia>
            <EmptyContent>
              <EmptyHeader>
                <EmptyTitle>
                  {search.trim()
                    ? t("faq.list.no_search_results")
                    : t("faq.empty")}
                </EmptyTitle>
                <EmptyDescription>
                  {search.trim()
                    ? t("faq.list.no_search_results_description")
                    : t("faq.empty_description")}
                </EmptyDescription>
              </EmptyHeader>
              {search.trim() ? (
                <Button
                  onClick={() => handleSearchChange("")}
                  variant="outline"
                >
                  {t("list.clear_search")}
                </Button>
              ) : (
                <Button
                  className="mt-4"
                  disabled={!kbSlug}
                  onClick={() =>
                    kbSlug ? navigate(kbNewFaqEditPath(kbSlug)) : undefined
                  }
                  size="sm"
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  {t("faq.new")}
                </Button>
              )}
            </EmptyContent>
          </Empty>
        </AdminListTableView>
      )}
    </section>
  );
}
