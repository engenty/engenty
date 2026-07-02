import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
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
  type ColumnConfig,
  DropdownMenu,
  DropdownMenuTrigger,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  ListDisplayConfigurator,
  ListFilterSelectTrigger,
  ListSearchInput,
  ListToolbarIconButton,
  ListViewModeToggle,
  Select,
  SelectContent,
  SelectItem,
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
import {
  type PageBreadcrumb,
  usePageConfig,
  useWorkspaceContext,
} from "@engenty/ui-plugin-sdk";
import {
  File,
  FolderOpen,
  HardDrive,
  Mail,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  deleteFile,
  FILES_UPLOAD_MAX_BYTES,
  getFilesUrl,
  uploadFileViaSignedUrl,
} from "../api.js";
import {
  FILES_DISPLAY_DEFAULTS,
  type FilesColumnKey,
  type FilesFileWithId,
  type FilesSortColumn,
} from "../components/file-columns.js";
import { FilePreviewPanel } from "../components/file-preview-panel.js";
import { FilesCards } from "../components/files-cards.js";
import { FilesTable } from "../components/files-table.js";
import {
  filesBucketsQueryOptions,
  filesChildrenQueryOptions,
  filesQueryOptions,
} from "../queries.js";

/** Uploads build a `tenants/<id>/…` key, so only the shared bucket accepts them. */
const UPLOADABLE_BUCKET = "files";

export function FilesListPage() {
  const { t } = useTranslation("files");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentTenant } = useWorkspaceContext();
  const tenantId = currentTenant?.id ?? null;

  const [search, setSearch] = useState("");
  const [selectedBucket, setSelectedBucket] = useState("files");
  const [prefix, setPrefix] = useState("");
  const [selectedFile, setSelectedFile] = useState<FilesFileWithId | null>(
    null
  );
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const searching = search.trim().length > 0;

  const { data: buckets } = useQuery(filesBucketsQueryOptions);

  const display = useListDisplayState<FilesColumnKey, FilesSortColumn>({
    storageKey: "files",
    defaults: FILES_DISPLAY_DEFAULTS,
    validSortColumns: ["filename", "size", "mime_type", "created_at"],
  });
  const { sortBy, sortOrder, tableSize, setSortBy, setSortOrder } = display;

  // Folder-aware listing while browsing; recursive flat results while searching.
  const childrenQuery = useQuery({
    ...filesChildrenQueryOptions({ bucket: selectedBucket, prefix }),
    enabled: !searching,
  });
  const searchQuery = useQuery({
    ...filesQueryOptions({
      bucket: selectedBucket,
      prefix: prefix || undefined,
      search: search || undefined,
      limit: 200,
    }),
    enabled: searching,
  });

  const rawFiles = searching ? searchQuery.data : childrenQuery.data?.files;
  const folders = searching ? [] : (childrenQuery.data?.folders ?? []);
  // `isLoading` is only true on the very first fetch — `keepPreviousData` keeps
  // the prior folder rendered while navigating, so we never blank the page.
  const isLoading = searching ? searchQuery.isLoading : childrenQuery.isLoading;
  const isNavigating = searching
    ? searchQuery.isPlaceholderData
    : childrenQuery.isPlaceholderData;
  const error = searching ? searchQuery.error : childrenQuery.error;

  /** Double-click a file → open the full detail page. */
  const openFull = useCallback(
    (file: FilesFileWithId) =>
      navigate(`/admin/files/${encodeURIComponent(file.key)}`),
    [navigate]
  );

  /** Warm the cache for a folder the moment the user hovers it. */
  const prefetchFolder = useCallback(
    (folderPrefix: string) => {
      void queryClient.prefetchQuery(
        filesChildrenQueryOptions({
          bucket: selectedBucket,
          prefix: folderPrefix,
        })
      );
    },
    [queryClient, selectedBucket]
  );

  const deleteMutation = useMutation({
    mutationFn: (key: string) => deleteFile(key, selectedBucket),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
      setDeleteKey(null);
      setSelectedFile(null);
    },
  });

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) {
        return;
      }
      if (!tenantId) {
        toast.error(t("actions.uploadMissingTenant"));
        return;
      }
      if (file.size > FILES_UPLOAD_MAX_BYTES) {
        toast.error(
          t("actions.uploadTooLarge", {
            maxMb: Math.round(FILES_UPLOAD_MAX_BYTES / 1024 / 1024),
          })
        );
        return;
      }
      try {
        await uploadFileViaSignedUrl(file, {
          bucket: selectedBucket,
          prefix: prefix.replace(/\/+$/, "") || undefined,
          tenantId,
        });
        toast.success(t("actions.uploadSuccess", { filename: file.name }));
        queryClient.invalidateQueries({ queryKey: ["files"] });
      } catch (uploadError) {
        const message =
          uploadError instanceof Error && uploadError.message
            ? uploadError.message
            : "upload_failed";
        toast.error(t("actions.uploadFailed", { error: message }));
      }
    },
    [queryClient, selectedBucket, prefix, t, tenantId]
  );

  const handleDownload = useCallback(
    async (key: string, filename: string) => {
      const result = await getFilesUrl(key, selectedBucket);
      const a = document.createElement("a");
      a.href = result.url;
      a.download = filename;
      a.target = "_blank";
      a.click();
    },
    [selectedBucket]
  );

  /* ── Sorted files (with id for useTableSelection) ── */
  const sortedFiles = useMemo<FilesFileWithId[]>(() => {
    if (!rawFiles) {
      return [];
    }
    const withId = rawFiles.map((f) => ({ ...f, id: f.key }));
    withId.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "filename":
          cmp = a.filename.localeCompare(b.filename);
          break;
        case "size":
          cmp = a.size_bytes - b.size_bytes;
          break;
        case "mime_type":
          cmp = a.mime_type.localeCompare(b.mime_type);
          break;
        case "created_at":
          cmp = a.created_at.localeCompare(b.created_at);
          break;
      }
      return sortOrder === "desc" ? -cmp : cmp;
    });
    return withId;
  }, [rawFiles, sortBy, sortOrder]);

  /* ── Selection ── */
  const { selectedIds, handleSelectAll, handleSelectOne, clearSelection } =
    useTableSelection({ items: sortedFiles });
  const hasSelection = selectedIds.size > 0;

  const goToPrefix = useCallback(
    (next: string) => {
      setPrefix(next);
      setSelectedFile(null);
      clearSelection();
    },
    [clearSelection]
  );

  const handleBucketChange = useCallback(
    (bucket: string) => {
      setSelectedBucket(bucket);
      setPrefix("");
      setSearch("");
      setSelectedFile(null);
      clearSelection();
    },
    [clearSelection]
  );

  const handleBulkDelete = useCallback(async () => {
    const keys = Array.from(selectedIds);
    if (keys.length === 0) {
      return;
    }
    setBulkDeleting(true);
    try {
      await Promise.all(keys.map((key) => deleteFile(key, selectedBucket)));
      queryClient.invalidateQueries({ queryKey: ["files"] });
      clearSelection();
      setBulkDeleteOpen(false);
    } finally {
      setBulkDeleting(false);
    }
  }, [selectedIds, selectedBucket, clearSelection, queryClient]);

  const handleSortChange = useCallback(
    (column: FilesSortColumn) => {
      if (sortBy === column) {
        setSortOrder(sortOrder === "asc" ? "desc" : "asc");
      } else {
        setSortBy(column);
      }
    },
    [sortBy, sortOrder, setSortBy, setSortOrder]
  );

  /* ── Column configs for ListDisplayConfigurator ── */
  const columns: ColumnConfig<FilesColumnKey>[] = useMemo(
    () => [
      { key: "filename", label: t("columns.filename"), icon: File },
      { key: "mime_type", label: t("columns.mime_type"), icon: File },
      { key: "size", label: t("columns.size"), icon: File },
      { key: "module", label: t("columns.module"), icon: File },
      { key: "inbox_message", label: t("columns.inbox_message"), icon: Mail },
      { key: "created_at", label: t("columns.created_at"), icon: File },
      { key: "key", label: t("columns.key"), icon: File },
    ],
    [t]
  );

  const sortOptions: { value: FilesSortColumn; label: string }[] = useMemo(
    () => [
      { value: "filename", label: t("columns.filename") },
      { value: "size", label: t("columns.size") },
      { value: "mime_type", label: t("columns.mime_type") },
      { value: "created_at", label: t("columns.created_at") },
    ],
    [t]
  );

  const canUpload = selectedBucket === UPLOADABLE_BUCKET;

  /* ── Path bar lives in the shell topbar (breadcrumbs) ── */
  const pageBreadcrumbs = useMemo<PageBreadcrumb[]>(() => {
    const segments = prefix.split("/").filter(Boolean);
    const crumbs: PageBreadcrumb[] = [
      {
        icon: <FolderOpen className="h-4 w-4" />,
        label: (
          <button
            className="max-w-[16rem] truncate rounded px-1.5 py-0.5 font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => goToPrefix("")}
            type="button"
          >
            {selectedBucket}
          </button>
        ),
        menuLabel: selectedBucket,
        tooltip: selectedBucket,
      },
    ];
    segments.forEach((segment, i) => {
      const isLast = i === segments.length - 1;
      const target = `${segments.slice(0, i + 1).join("/")}/`;
      crumbs.push({
        label: isLast ? (
          <span className="max-w-[16rem] truncate px-1.5 py-0.5 font-medium text-foreground">
            {segment}
          </span>
        ) : (
          <button
            className="max-w-[16rem] truncate rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => goToPrefix(target)}
            type="button"
          >
            {segment}
          </button>
        ),
        menuLabel: segment,
      });
    });
    return crumbs;
  }, [prefix, selectedBucket, goToPrefix]);

  usePageConfig({
    breadcrumbs: pageBreadcrumbs,
    actions: canUpload ? (
      <Button
        onClick={() => fileInputRef.current?.click()}
        size="sm"
        variant="outline"
      >
        <Upload className="mr-1.5 h-4 w-4" />
        {t("actions.upload")}
      </Button>
    ) : null,
  });

  // ── Loading ──
  if (isLoading) {
    return (
      <section className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-page">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableHead key={`skeleton-head-${i}`}>
                    <Skeleton className="h-4 w-20" />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`skeleton-row-${i}`}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <TableCell key={`skeleton-cell-${i}-${j}`}>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <section className="flex items-center justify-center p-8">
        <div className="rounded-md border border-red-300/40 bg-red-100/10 p-3 text-red-700 text-sm dark:text-red-300">
          {error instanceof Error ? error.message : "Failed to load files"}
        </div>
      </section>
    );
  }

  const displayMenu = (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <ListToolbarIconButton aria-label={t("display.display")} type="button">
          <SlidersHorizontal />
        </ListToolbarIconButton>
      </DropdownMenuTrigger>
      <ListDisplayConfigurator<FilesColumnKey, FilesSortColumn>
        columnOrder={display.columnOrder}
        columns={columns}
        columnVisibility={display.columnVisibility}
        labels={{
          table: t("display.tableView"),
          cards: t("display.cardsView"),
          compactView: t("display.compactView"),
          sortBy: t("display.sortBy"),
          ascending: t("display.ascending"),
          descending: t("display.descending"),
          displayedInTable: t("display.displayedColumns"),
          hiddenInTable: t("display.hiddenInTable"),
          showAll: t("display.showAll"),
          hideAll: t("display.hideAll"),
          noColumnsDisplayed: t("display.noColumnsDisplayed"),
        }}
        setColumnOrder={display.setColumnOrder}
        setColumnVisibility={display.setColumnVisibility}
        setSortBy={display.setSortBy}
        setSortOrder={display.setSortOrder}
        setTableSize={display.setTableSize}
        setViewMode={display.setViewMode}
        sortBy={sortBy}
        sortOptions={sortOptions}
        sortOrder={sortOrder}
        tableSize={display.tableSize}
        viewMode={display.viewMode}
      />
    </DropdownMenu>
  );

  const header = (
    <div className="flex w-full flex-col gap-2">
      <div className="flex min-w-0 flex-col gap-2 sm:gap-3 md:flex-row md:items-center">
        {/* ── Left: bucket + search + count ── */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
          {buckets && buckets.length > 1 && (
            <Select onValueChange={handleBucketChange} value={selectedBucket}>
              <ListFilterSelectTrigger className="w-[180px] shrink-0">
                <SelectValue placeholder="Bucket">
                  {(() => {
                    const b = buckets?.find((bb) => bb.id === selectedBucket);
                    if (!b) {
                      return selectedBucket;
                    }
                    return b.id + (b.default ? " ★" : "");
                  })()}
                </SelectValue>
              </ListFilterSelectTrigger>
              <SelectContent>
                {buckets.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.id}
                    {b.default ? " ★" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="w-full min-w-0 max-w-full sm:max-w-md md:max-w-lg lg:max-w-xl">
            <ListSearchInput
              className="w-full"
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("toolbar.search")}
              value={search}
              wrapperClassName="w-full"
            />
          </div>
          <p className="min-w-0 shrink-0 whitespace-nowrap text-muted-foreground text-xs tabular-nums">
            {hasSelection
              ? t("toolbar.selected", { count: selectedIds.size })
              : t("toolbar.items", { count: sortedFiles.length })}
          </p>
        </div>

        {/* ── Right: bulk actions OR upload + view toggle + display ── */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 md:ml-auto md:shrink-0 md:justify-end">
          {hasSelection && (
            <>
              <Button
                className="gap-1.5"
                onClick={() => setBulkDeleteOpen(true)}
                size="sm"
                variant="destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t("actions.delete")}
              </Button>
              <Button
                className="gap-1"
                onClick={clearSelection}
                size="sm"
                variant="ghost"
              >
                <X className="h-3.5 w-3.5" />
                {t("actions.cancel")}
              </Button>
            </>
          )}
          <ListViewModeToggle
            labels={{
              cards: t("display.cardsView"),
              group: t("display.display"),
              table: t("display.tableView"),
            }}
            onChange={display.setViewMode}
            value={display.viewMode}
          />
          {displayMenu}
        </div>
      </div>
    </div>
  );

  const isEmpty = sortedFiles.length === 0 && folders.length === 0;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden p-page">
      <input
        accept="*/*"
        className="hidden"
        onChange={handleUpload}
        ref={fileInputRef}
        type="file"
      />
      {isEmpty ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {header}
          <Empty>
            <EmptyMedia>
              <HardDrive className="h-16 w-16 text-muted-foreground/30" />
            </EmptyMedia>
            <EmptyContent>
              <EmptyHeader>
                <EmptyTitle>
                  {prefix ? t("empty.prefixTitle") : t("empty.title")}
                </EmptyTitle>
                <EmptyDescription>
                  {prefix
                    ? t("empty.prefixDescription")
                    : t("empty.description")}
                </EmptyDescription>
              </EmptyHeader>
            </EmptyContent>
          </Empty>
        </div>
      ) : display.viewMode === "cards" ? (
        <AdminListCardsView
          contentClassName="p-3"
          header={header}
          variant="card"
        >
          <div
            aria-busy={isNavigating}
            className={
              isNavigating ? "opacity-60 transition-opacity" : undefined
            }
          >
            <FilesCards
              bucket={selectedBucket}
              files={sortedFiles}
              folders={folders}
              onCardClick={setSelectedFile}
              onOpenFolder={goToPrefix}
              onOpenFull={openFull}
              onPrefetchFolder={prefetchFolder}
              onSelectOne={handleSelectOne}
              selectedIds={selectedIds}
              tableSize={tableSize}
            />
          </div>
        </AdminListCardsView>
      ) : (
        <AdminListTableView header={header} stickyHeaderShadow>
          <div
            aria-busy={isNavigating}
            className={
              isNavigating ? "opacity-60 transition-opacity" : undefined
            }
          >
            <FilesTable
              bucket={selectedBucket}
              columnOrder={display.columnOrder}
              columnVisibility={display.columnVisibility}
              files={sortedFiles}
              folders={folders}
              onDelete={setDeleteKey}
              onDownload={handleDownload}
              onOpenFolder={goToPrefix}
              onOpenFull={openFull}
              onPrefetchFolder={prefetchFolder}
              onRowClick={setSelectedFile}
              onSelectAll={handleSelectAll}
              onSelectOne={handleSelectOne}
              onSortChange={handleSortChange}
              selectedIds={selectedIds}
              sortBy={sortBy}
              sortOrder={sortOrder}
              tableSize={tableSize}
            />
          </div>
        </AdminListTableView>
      )}

      <FilePreviewPanel
        bucket={selectedBucket}
        file={selectedFile}
        onClose={() => setSelectedFile(null)}
        onDelete={(key) => {
          setSelectedFile(null);
          setDeleteKey(key);
        }}
        onDownload={handleDownload}
      />

      {/* ── Single delete confirmation ── */}
      <AlertDialog
        onOpenChange={(open) => !open && setDeleteKey(null)}
        open={deleteKey !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("actions.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("actions.confirmDeleteMessage")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteKey && deleteMutation.mutate(deleteKey)}
            >
              {t("actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Bulk delete confirmation ── */}
      <AlertDialog
        onOpenChange={(open) => !open && setBulkDeleteOpen(false)}
        open={bulkDeleteOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("actions.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("toolbar.selected", { count: selectedIds.size })} —{" "}
              {t("actions.confirmDeleteMessage")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkDeleting}
              onClick={() => void handleBulkDelete()}
            >
              {bulkDeleting ? "…" : t("actions.deleteSelected")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
