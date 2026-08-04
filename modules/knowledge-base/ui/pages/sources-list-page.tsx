import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  AdminListCardsView,
  AdminListTableView,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
import { Link2, Play, Trash2 } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import type { KbSource, KbSourceStatus } from "../../src/schema/types.js";
import {
  KbFileUploadSourceDialog,
  KbManualSourceDialog,
} from "../components/kb-extra-source-create-dialogs.js";
import { KbModuleShellActions } from "../components/kb-module-shell-actions.js";
import { SourceAdapterDialog } from "../components/source-adapter-dialog.js";
import type { SourceAdapterDialogInput } from "../components/source-adapter-editor.js";
import { SourceItemsDialog } from "../components/source-items-dialog.js";
import { SourcesCards } from "../components/sources-cards.js";
import type {
  SourcesColumnVisibility,
  SourcesSortColumn,
} from "../components/sources-table.js";
import { SourcesTable } from "../components/sources-table.js";
import { SourcesTableToolbar } from "../components/sources-table-toolbar.js";
import { useKbSourcesListAgentUiSlice } from "../hooks/use-kb-agent-ui-slice-content.js";
import { useKbModuleSecondaryShellNav } from "../hooks/use-kb-module-secondary-shell-nav.js";
import { parseKbOpenSourceAddFromLocation } from "../kb-open-source-add-state.js";
import { KB_MODULE_BASE, kbSourcePath, kbSourcesPath } from "../kb-paths.js";
import { mergeKbSourceAdaptersForPicker } from "../kb-source-adapters-merge.js";
import {
  kbModulePageListShellSectionClassName,
  kbModulePageShellSectionClassName,
} from "../lib/kb-page-shell.js";
import { getSourcesToolbarLabels } from "../lib/sources-toolbar-labels.js";
import {
  kbSourcesListQueryOptions,
  kbsQueryOptions,
  sourceAdaptersQueryOptions,
  useKbSourceMutations,
} from "../queries.js";
import { kbIdFromSlug, slugFromKbId } from "../resolve-kb-id.js";

const SOURCES_DISPLAY_DEFAULTS = {
  viewMode: "table" as const,
  tableSize: "normal" as const,
  sortBy: "updated_at" as SourcesSortColumn,
  sortOrder: "desc" as const,
  columnVisibility: {
    name: true,
    adapter: true,
    status: true,
    lastRun: true,
    nextRun: true,
    updatedAt: false,
    createdAt: false,
  } satisfies SourcesColumnVisibility,
  columnOrder: [
    "name",
    "adapter",
    "status",
    "lastRun",
    "nextRun",
    "updatedAt",
    "createdAt",
  ] as (keyof SourcesColumnVisibility)[],
};

export function SourcesListPage() {
  const { t } = useTranslation("kb");
  const navigate = useNavigate();
  const location = useLocation();
  const { kbSlug: kbSlugParam } = useParams<{ kbSlug?: string }>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createPresetAdapterId, setCreatePresetAdapterId] = useState<
    string | null
  >(null);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [lastWebhookToken, setLastWebhookToken] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | KbSourceStatus>(
    "all"
  );
  const [selectedSource, setSelectedSource] = useState<KbSource | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KbSource | null>(null);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkSourceStatus, setBulkSourceStatus] =
    useState<KbSourceStatus>("active");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [fileUploadDialogOpen, setFileUploadDialogOpen] = useState(false);
  const [extraSourceSubmitting, setExtraSourceSubmitting] = useState(false);
  const [pendingDropFiles, setPendingDropFiles] = useState<File[] | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const { data: kbsRaw, isLoading: kbsLoading } = useQuery(kbsQueryOptions);
  const { data: adaptersRaw = [] } = useQuery(sourceAdaptersQueryOptions);
  const adapters = useMemo(
    () => mergeKbSourceAdaptersForPicker(adaptersRaw),
    [adaptersRaw]
  );
  /** `manual` / `file_upload` are separate menu rows with module i18n; omit from adapter list. */
  const adaptersForAddMenu = useMemo(
    () => adapters.filter((a) => a.id !== "manual" && a.id !== "file_upload"),
    [adapters]
  );
  const kbs = Array.isArray(kbsRaw) ? kbsRaw : [];
  const kbId = useMemo(
    () => (kbSlugParam ? kbIdFromSlug(kbs, kbSlugParam) : null),
    [kbSlugParam, kbs]
  );
  const kbSlug = useMemo(() => slugFromKbId(kbs, kbId), [kbs, kbId]);

  useEffect(() => {
    if (!kbsLoading && kbSlugParam && !kbId) {
      navigate(KB_MODULE_BASE, { replace: true });
    }
  }, [kbId, kbSlugParam, kbsLoading, navigate]);

  const display = useListDisplayState<
    keyof SourcesColumnVisibility,
    SourcesSortColumn
  >({
    storageKey: "kb-sources",
    defaults: SOURCES_DISPLAY_DEFAULTS,
    validSortColumns: [
      "name",
      "created_at",
      "updated_at",
      "last_run_at",
      "next_run_at",
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
    setViewMode,
    setTableSize,
    setColumnVisibility,
    setColumnOrder,
  } = display;

  const listQuery = useMemo(
    () => ({
      kb_id: kbId ?? "",
      page,
      page_size: 25,
      search: search.trim() || undefined,
      sort_by: sortBy,
      sort_order: sortOrder,
      status: statusFilter === "all" ? undefined : statusFilter,
    }),
    [kbId, page, search, sortBy, sortOrder, statusFilter]
  );

  const {
    data: pageData,
    isLoading,
    error: listError,
    refetch,
  } = useQuery(kbSourcesListQueryOptions(listQuery));
  const mutations = useKbSourceMutations(listQuery);

  const navigateKb = useCallback(
    (nextKbId: string) => {
      const nextSlug = slugFromKbId(kbs, nextKbId);
      if (nextSlug) {
        navigate(kbSourcesPath(nextSlug));
      }
    },
    [kbs, navigate]
  );

  const kbShellNav = useKbModuleSecondaryShellNav({
    kbId: kbId ?? "",
    kbSlug: kbSlug ?? "",
    onKbChange: navigateKb,
  });

  const openCreateWithAdapter = useCallback((adapterId: string) => {
    setSelectedSource(null);
    setCreatePresetAdapterId(adapterId);
    setDialogOpen(true);
  }, []);

  useEffect(() => {
    const addState = parseKbOpenSourceAddFromLocation(location.state);
    if (addState === null) {
      return;
    }
    if (addState === "manual") {
      setManualDialogOpen(true);
    } else if (addState === "file_upload") {
      setFileUploadDialogOpen(true);
    } else if (typeof addState === "object") {
      openCreateWithAdapter(addState.adapterId);
    } else if (adaptersForAddMenu.length > 0) {
      openCreateWithAdapter(adaptersForAddMenu[0].id);
    } else {
      setManualDialogOpen(true);
    }
    navigate(
      { pathname: location.pathname, search: location.search },
      { replace: true, state: null }
    );
  }, [
    adaptersForAddMenu,
    location.pathname,
    location.search,
    location.state,
    navigate,
    openCreateWithAdapter,
  ]);

  const pageActions = useMemo(
    () => (kbSlug ? <KbModuleShellActions kbSlug={kbSlug} /> : null),
    [kbSlug]
  );

  usePageConfig({
    topbarChrome: "contentBlend",
    contentStackBackground: "paper",
    actions: pageActions,
    breadcrumbs: useMemo(
      () => [
        ...(kbShellNav.kbRootCrumb ? [kbShellNav.kbRootCrumb] : []),
        { label: t("sources.title") },
      ],
      [kbShellNav.kbRootCrumb, t]
    ),
    secondaryNavAfterItems: kbShellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: kbShellNav.secondaryNavHeaderSlot,
  });

  const onSourceDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setCreatePresetAdapterId(null);
    }
  };

  const handleDialogStarted = useCallback(
    (sourceId: string) => {
      navigate(kbSourcePath(kbSlug ?? kbSlugParam ?? "", sourceId));
    },
    [kbSlug, kbSlugParam, navigate]
  );

  /**
   * Returns the created source ID for indexable adapters (so the dialog can
   * transition to step 2), or undefined for edit / manual / file_upload.
   */
  const submitSource = async (
    input: SourceAdapterDialogInput
  ): Promise<string | undefined> => {
    if (!kbId) {
      return;
    }
    try {
      if (selectedSource) {
        await mutations.update.mutateAsync({ id: selectedSource.id, input });
        toast.success(t("sources.updated"));
        setDialogOpen(false);
        setSelectedSource(null);
        return;
      }

      const created = await mutations.create.mutateAsync({
        ...input,
        kb_id: kbId,
      });
      setSelectedSource(null);

      const createdId: string | undefined =
        (created as { data?: { id?: string } })?.data?.id ??
        (created as { id?: string })?.id;

      if (
        !createdId ||
        input.adapter_id === "manual" ||
        input.adapter_id === "file_upload"
      ) {
        setDialogOpen(false);
        toast.success(t("sources.created"));
        return;
      }

      // Return the ID — the dialog will transition to step 2
      toast.success(t("sources.created"));
      return createdId;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("sources.save_failed")
      );
      return;
    }
  };

  const handleSearchChange = useCallback((value: string) => {
    setPage(1);
    setSearch(value);
  }, []);

  const handleSortByChange = useCallback(
    (value: SourcesSortColumn) => {
      setPage(1);
      setSortBy(value);
    },
    [setSortBy]
  );

  const handleSortOrderChange = useCallback(
    (value: "asc" | "desc") => {
      setPage(1);
      setSortOrder(value);
    },
    [setSortOrder]
  );

  const handleStatusFilterChange = useCallback(
    (value: "all" | KbSourceStatus) => {
      setPage(1);
      setStatusFilter(value);
    },
    []
  );

  const handleSortChange = useCallback(
    (column: SourcesSortColumn) => {
      setPage(1);
      if (sortBy === column) {
        setSortOrder(sortOrder === "asc" ? "desc" : "asc");
      } else {
        setSortBy(column);
      }
    },
    [sortBy, sortOrder, setSortBy, setSortOrder]
  );

  const handleRotate = useCallback(
    (source: KbSource) => {
      mutations.rotateWebhook.mutate(source.id, {
        onSuccess: (result) => {
          setLastWebhookToken(result.webhook_token);
          toast.info(t("sources.webhook_token_created"));
        },
      });
    },
    [mutations, t]
  );

  const handleRun = useCallback(
    (source: KbSource) => {
      mutations.run.mutate(source.id);
    },
    [mutations]
  );

  const rows = pageData?.data ?? [];
  const total = pageData?.total ?? 0;
  const pageSize = pageData?.page_size ?? 25;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useKbSourcesListAgentUiSlice({
    search,
    sources: rows,
    statusFilter,
    total,
  });

  const selection = useTableSelection<KbSource>({ items: rows });
  const {
    selectedIds,
    allSelected,
    someSelected,
    handleSelectAll,
    handleSelectOne,
    clearSelection,
  } = selection;

  useEffect(() => {
    if (viewMode === "cards") {
      clearSelection();
    }
  }, [viewMode, clearSelection]);

  const handleApplyBulkSourceStatus = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      return;
    }
    setBulkBusy(true);
    try {
      await Promise.all(
        ids.map((id) =>
          mutations.update.mutateAsync({
            id,
            input: { status: bulkSourceStatus },
          })
        )
      );
      toast.success(t("sources.bulk_applied"));
      clearSelection();
      setBulkStatusOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("sources.save_failed"));
    } finally {
      setBulkBusy(false);
    }
  }, [bulkSourceStatus, clearSelection, mutations.update, selectedIds, t]);

  const handleApplyBulkSourceDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      return;
    }
    setBulkBusy(true);
    try {
      await Promise.all(ids.map((id) => mutations.delete.mutateAsync(id)));
      toast.success(t("sources.bulk_deleted"));
      clearSelection();
      setBulkDeleteOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("sources.save_failed"));
    } finally {
      setBulkBusy(false);
    }
  }, [clearSelection, mutations.delete, selectedIds, t]);

  const handleApplyBulkSourceRun = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      return;
    }
    setBulkBusy(true);
    try {
      await Promise.all(ids.map((id) => mutations.run.mutateAsync(id)));
      toast.success(t("sources.bulk_ran"));
      clearSelection();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("sources.save_failed"));
    } finally {
      setBulkBusy(false);
    }
  }, [clearSelection, mutations.run, selectedIds, t]);

  const toolbarLabels = useMemo(
    () => getSourcesToolbarLabels(t, total),
    [t, total]
  );

  const sourcesBulkActions =
    selectedIds.size > 0 && viewMode === "table" ? (
      <>
        <Button
          className="h-9 gap-1.5 px-2 text-xs"
          onClick={() => setBulkStatusOpen(true)}
          size="sm"
          type="button"
          variant="outline"
        >
          {t("sources.bulk_set_status", { count: selectedIds.size })}
        </Button>
        <Button
          className="h-9 gap-1.5 px-2 text-xs"
          disabled={bulkBusy}
          onClick={() => void handleApplyBulkSourceRun()}
          size="sm"
          type="button"
          variant="outline"
        >
          <Play className="h-3.5 w-3.5" />
          {t("sources.bulk_run", { count: selectedIds.size })}
        </Button>
        <Button
          className="h-9 gap-1.5 px-2 text-xs"
          onClick={() => setBulkDeleteOpen(true)}
          size="sm"
          type="button"
          variant="destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t("sources.bulk_delete", { count: selectedIds.size })}
        </Button>
      </>
    ) : null;

  const listErrorMessage =
    listError instanceof Error
      ? listError.message
      : listError
        ? String(listError)
        : null;

  if (kbsLoading || !kbId || !kbSlug) {
    return (
      <section className={kbModulePageShellSectionClassName}>
        <Skeleton className="h-10 w-full max-w-xl" />
        <Skeleton className="mt-4 h-40 w-full" />
      </section>
    );
  }

  const pagination = {
    nextLabel: t("list.next"),
    onNext: () => setPage((p) => Math.min(totalPages, p + 1)),
    onPrevious: () => setPage((p) => Math.max(1, p - 1)),
    page,
    pageOfLabel: t("list.page_of", { page, totalPages }),
    previousLabel: t("list.previous"),
    totalPages,
  };

  const toolbarHeader = (
    <SourcesTableToolbar
      bulkActions={sourcesBulkActions}
      clearSelectionLabel={toolbarLabels.clearSelection}
      columnOrder={columnOrder}
      columnVisibility={columnVisibility}
      labels={toolbarLabels}
      onClearSelection={clearSelection}
      onSearchChange={handleSearchChange}
      onSortByChange={handleSortByChange}
      onSortOrderChange={handleSortOrderChange}
      onStatusFilterChange={handleStatusFilterChange}
      searchQuery={search}
      selectedCount={selectedIds.size}
      setColumnOrder={setColumnOrder}
      setColumnVisibility={setColumnVisibility}
      setTableSize={setTableSize}
      setViewMode={setViewMode}
      sortBy={sortBy}
      sortOrder={sortOrder}
      statusFilter={statusFilter}
      tableSize={tableSize}
      viewMode={viewMode}
    />
  );

  const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
    setIsDragOver(false);
    if (!e.dataTransfer.files.length) {
      return;
    }
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    setPendingDropFiles(files);
    setFileUploadDialogOpen(true);
  };

  return (
    <section
      className={kbModulePageListShellSectionClassName}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={
        isDragOver
          ? {
              outline: "2px dashed hsl(var(--primary))",
              outlineOffset: "-2px",
              borderRadius: "0.5rem",
            }
          : undefined
      }
    >
      {lastWebhookToken ? (
        <div className="shrink-0 rounded-md border bg-muted/40 p-3 text-sm">
          <div className="font-medium">
            {t("sources.webhook_token_created")}
          </div>
          <code className="mt-1 block break-all">
            /api/kb/source-webhooks/{lastWebhookToken}
          </code>
        </div>
      ) : null}

      {listErrorMessage ? (
        <div className="shrink-0 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm">
          {listErrorMessage}
          <Button
            className="ml-3"
            onClick={() => refetch()}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("sources.retry")}
          </Button>
        </div>
      ) : null}

      {isLoading && (
        <AdminListTableView header={toolbarHeader}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Skeleton className="mx-auto h-4 w-4" />
                </TableHead>
                {columnOrder
                  .filter((k) => columnVisibility[k])
                  .map((key) => (
                    <TableHead key={key}>
                      <Skeleton className="h-4 w-20" />
                    </TableHead>
                  ))}
                <TableHead className="w-10">
                  <Skeleton className="h-4 w-4" />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 6 }, (_, i) => `sk-${i}`).map((rowKey) => (
                <TableRow key={rowKey}>
                  <TableCell>
                    <Skeleton className="mx-auto h-4 w-4" />
                  </TableCell>
                  {columnOrder
                    .filter((k) => columnVisibility[k])
                    .map((key) => (
                      <TableCell key={key}>
                        <Skeleton
                          className={key === "name" ? "h-4 w-40" : "h-5 w-24"}
                        />
                      </TableCell>
                    ))}
                  <TableCell>
                    <Skeleton className="h-7 w-7" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AdminListTableView>
      )}

      {!isLoading && rows.length > 0 && viewMode === "table" && (
        <AdminListTableView header={toolbarHeader} pagination={pagination}>
          <SourcesTable
            adapters={adapters}
            allSelected={allSelected}
            columnOrder={columnOrder}
            columnVisibility={columnVisibility}
            kbSlug={kbSlug}
            listQuery={listQuery}
            onDeleteRequest={setDeleteTarget}
            onEdit={(source) => {
              setCreatePresetAdapterId(null);
              setSelectedSource(source);
              setDialogOpen(true);
            }}
            onOpenItems={(source) => {
              setSelectedSource(source);
              setItemsOpen(true);
            }}
            onSelectAll={handleSelectAll}
            onSelectOne={handleSelectOne}
            onSortChange={handleSortChange}
            onWebhookRotated={(token) => {
              setLastWebhookToken(token);
              toast.info(t("sources.webhook_token_created"));
            }}
            selectedIds={selectedIds}
            someSelected={someSelected}
            sortBy={sortBy}
            sortOrder={sortOrder}
            sources={rows}
            tableSize={tableSize}
          />
        </AdminListTableView>
      )}

      {!isLoading && rows.length > 0 && viewMode === "cards" && (
        <AdminListCardsView header={toolbarHeader} variant="card">
          <SourcesCards
            adapters={adapters}
            kbSlug={kbSlug}
            onDelete={setDeleteTarget}
            onEdit={(source) => {
              setCreatePresetAdapterId(null);
              setSelectedSource(source);
              setDialogOpen(true);
            }}
            onOpenItems={(source) => {
              setSelectedSource(source);
              setItemsOpen(true);
            }}
            onRotate={handleRotate}
            onRun={handleRun}
            sources={rows}
            tableSize={tableSize}
          />
        </AdminListCardsView>
      )}

      {!isLoading && rows.length === 0 && (
        <AdminListTableView header={toolbarHeader} pagination={pagination}>
          <Empty>
            <EmptyMedia>
              <Link2 className="h-16 w-16 text-muted-foreground/30" />
            </EmptyMedia>
            <EmptyContent>
              <EmptyHeader>
                <EmptyTitle>
                  {search.trim() || statusFilter !== "all"
                    ? t("sources.list_no_results")
                    : t("sources.list_empty")}
                </EmptyTitle>
                <EmptyDescription>
                  {search.trim() || statusFilter !== "all"
                    ? t("sources.list_no_results_description")
                    : t("sources.list_empty_description")}
                </EmptyDescription>
              </EmptyHeader>
              {search.trim() || statusFilter !== "all" ? (
                <Button
                  onClick={() => {
                    handleSearchChange("");
                    handleStatusFilterChange("all");
                  }}
                  type="button"
                  variant="outline"
                >
                  {toolbarLabels.clearFilters}
                </Button>
              ) : null}
            </EmptyContent>
          </Empty>
        </AdminListTableView>
      )}

      <Dialog onOpenChange={setBulkStatusOpen} open={bulkStatusOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>{t("sources.bulk_status_title")}</DialogTitle>
            <DialogDescription>
              {t("sources.bulk_status_description")}
            </DialogDescription>
          </DialogHeader>
          <Select
            onValueChange={(v) => setBulkSourceStatus(v as KbSourceStatus)}
            value={bulkSourceStatus}
          >
            <SelectTrigger>
              <SelectValue>
                {bulkSourceStatus === "active"
                  ? t("sources.filter_active")
                  : bulkSourceStatus === "paused"
                    ? t("sources.filter_paused")
                    : t("sources.filter_failed")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">
                {t("sources.filter_active")}
              </SelectItem>
              <SelectItem value="paused">
                {t("sources.filter_paused")}
              </SelectItem>
              <SelectItem value="failed">
                {t("sources.filter_failed")}
              </SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button
              onClick={() => setBulkStatusOpen(false)}
              type="button"
              variant="outline"
            >
              {t("actions.cancel")}
            </Button>
            <Button
              disabled={bulkBusy}
              onClick={() => void handleApplyBulkSourceStatus()}
              type="button"
            >
              {t("sources.bulk_status_apply")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        onOpenChange={(open) => !open && setBulkDeleteOpen(false)}
        open={bulkDeleteOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("sources.bulk_delete_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("sources.bulk_delete_description", {
                count: selectedIds.size,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkBusy}
              onClick={() => void handleApplyBulkSourceDelete()}
            >
              {t("sources.bulk_delete_confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SourceAdapterDialog
        adapters={adapters}
        onOpenChange={onSourceDialogOpenChange}
        onStarted={handleDialogStarted}
        onSubmit={submitSource}
        open={dialogOpen}
        presetAdapterId={createPresetAdapterId}
        saving={mutations.create.isPending || mutations.update.isPending}
        source={selectedSource}
      />
      <SourceItemsDialog
        kbSlug={kbSlug ?? ""}
        onOpenChange={setItemsOpen}
        open={itemsOpen}
        source={selectedSource}
      />

      {kbId ? (
        <>
          <KbManualSourceDialog
            kbId={kbId}
            onOpenChange={setManualDialogOpen}
            onSubmittingChange={setExtraSourceSubmitting}
            onSuccess={() => {
              void refetch();
              toast.success(t("sources.created"));
            }}
            open={manualDialogOpen}
            saving={extraSourceSubmitting || mutations.create.isPending}
          />
          <KbFileUploadSourceDialog
            initialFiles={pendingDropFiles ?? undefined}
            kbId={kbId}
            kbSlug={kbSlug}
            onOpenChange={(open) => {
              setFileUploadDialogOpen(open);
              if (!open) {
                setPendingDropFiles(null);
              }
            }}
            onSubmittingChange={setExtraSourceSubmitting}
            onSuccess={() => {
              void refetch();
              toast.success(t("sources.created"));
            }}
            open={fileUploadDialogOpen}
            saving={extraSourceSubmitting || mutations.create.isPending}
          />
        </>
      ) : null}

      <AlertDialog
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        open={deleteTarget !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("sources.delete_source_confirm")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("sources.delete_source_confirm_desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!deleteTarget || mutations.delete.isPending}
              onClick={() => {
                if (deleteTarget) {
                  mutations.delete.mutate(deleteTarget.id, {
                    onSuccess: () => {
                      setDeleteTarget(null);
                      toast.success(t("sources.deleted"));
                    },
                  });
                }
              }}
            >
              {t("sources.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
