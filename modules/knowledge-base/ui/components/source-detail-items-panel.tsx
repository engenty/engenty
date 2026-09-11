import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Checkbox,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  STICKY_HEADER_CLASS,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@engenty/ui-core";
import { Eye, EyeOff, RefreshCw, Search, Trash2, X } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useDeferredValue, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { KbSourceRun } from "../../src/schema/sources.js";
import type { KbSource } from "../../src/schema/types.js";
import type { KbSourcesListQuery } from "../api.js";
import { kbSourceItemPath } from "../kb-paths.js";
import { kbSourceItemsQueryOptions, useKbSourceMutations } from "../queries.js";

export function SourceDetailItemsPanel({
  itemsPage,
  listQuery,
  runs,
  setItemsPage,
  source,
}: {
  itemsPage: number;
  listQuery?: KbSourcesListQuery;
  runs?: KbSourceRun[];
  setItemsPage: Dispatch<SetStateAction<number>>;
  source: KbSource;
}) {
  const { t } = useTranslation("kb");
  const itemsPageSize = 25;
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState("all");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const isRunning = runs?.some((r) => r.status === "running") ?? false;

  const { data: itemsPageData, isLoading: itemsLoading } = useQuery({
    ...kbSourceItemsQueryOptions({
      page: itemsPage,
      page_size: itemsPageSize,
      search: deferredSearchQuery,
      sourceId: source.id,
      status: statusFilter === "all" ? undefined : statusFilter,
    }),
    refetchInterval: isRunning ? 3000 : false,
  });
  const mutations = useKbSourceMutations(listQuery);

  const itemRows = itemsPageData?.data ?? [];
  const itemsTotal = itemsPageData?.total ?? 0;
  const itemsTotalPages = Math.max(1, Math.ceil(itemsTotal / itemsPageSize));

  // Reset selection when page or source changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [deferredSearchQuery, itemsPage, source.id, statusFilter]);

  useEffect(() => {
    setItemsPage(1);
  }, [deferredSearchQuery, setItemsPage, statusFilter]);

  const pageIds = itemRows.map((r) => r.id);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const somePageSelected = pageIds.some((id) => selectedIds.has(id));

  function toggleAll() {
    if (allPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of pageIds) {
          next.delete(id);
        }
        return next;
      });
    } else {
      setSelectedIds((prev) => new Set([...prev, ...pageIds]));
    }
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function bulkSetStatus(status: "active" | "ignored") {
    const targets = itemRows.filter((r) => selectedIds.has(r.id));
    for (const item of targets) {
      mutations.updateItemStatus.mutate({
        itemId: item.id,
        sourceId: source.id,
        status,
      });
    }
    setSelectedIds(new Set());
  }

  function bulkReindexSelected() {
    const selectedItemKeys = itemRows
      .filter((r) => selectedIds.has(r.id))
      .map((r) => r.adapter_item_key);
    if (selectedItemKeys.length === 0) {
      return;
    }
    mutations.reindex.mutate({
      selectedItemKeys,
      sourceId: source.id,
    });
    setSelectedIds(new Set());
  }

  async function bulkDeleteSelected() {
    const targets = itemRows.filter((r) => selectedIds.has(r.id));
    if (targets.length === 0) {
      return;
    }
    setDeleteBusy(true);
    try {
      await Promise.all(
        targets.map((item) =>
          mutations.deleteItem.mutateAsync({
            itemId: item.id,
            sourceId: source.id,
          })
        )
      );
      toast.success(t("sources.items_deleted", { count: targets.length }));
      setSelectedIds(new Set());
      setDeleteOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("sources.save_failed"));
    } finally {
      setDeleteBusy(false);
    }
  }

  const selectionCount = selectedIds.size;
  const hasActiveFilters =
    Boolean(searchQuery.trim()) || statusFilter !== "all";
  const colSpan = 5;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="ui-card-panel flex shrink-0 flex-col gap-2 px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-8"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t("sources.items_filter_placeholder")}
              value={searchQuery}
            />
          </div>
          <Select onValueChange={setStatusFilter} value={statusFilter}>
            <SelectTrigger className="h-9 w-[150px] text-xs">
              <SelectValue>
                {statusFilter === "all"
                  ? t("sources.items_filter_status_all")
                  : statusFilter === "active"
                    ? t("sources.items_filter_status_active")
                    : statusFilter === "ignored"
                      ? t("sources.items_filter_status_ignored")
                      : statusFilter === "missing"
                        ? t("sources.items_filter_status_missing")
                        : statusFilter === "draft"
                          ? t("sources.items_filter_status_draft")
                          : t("sources.items_filter_status_deleted")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {t("sources.items_filter_status_all")}
              </SelectItem>
              <SelectItem value="active">
                {t("sources.items_filter_status_active")}
              </SelectItem>
              <SelectItem value="ignored">
                {t("sources.items_filter_status_ignored")}
              </SelectItem>
              <SelectItem value="missing">
                {t("sources.items_filter_status_missing")}
              </SelectItem>
              <SelectItem value="draft">
                {t("sources.items_filter_status_draft")}
              </SelectItem>
              <SelectItem value="deleted">
                {t("sources.items_filter_status_deleted")}
              </SelectItem>
            </SelectContent>
          </Select>
          {hasActiveFilters ? (
            <Button
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("all");
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              {t("sources.clear_filters")}
            </Button>
          ) : null}
        </div>

        <div className="flex min-h-8 flex-wrap items-center gap-2 text-sm">
          {selectionCount > 0 ? (
            <>
              <span className="text-muted-foreground">
                {t("sources.items_selected", { count: selectionCount })}
              </span>
              <Button
                onClick={() => bulkSetStatus("active")}
                size="sm"
                type="button"
                variant="outline"
              >
                <Eye className="mr-1.5 h-3.5 w-3.5" />
                {t("sources.activate")}
              </Button>
              <Button
                onClick={() => bulkSetStatus("ignored")}
                size="sm"
                type="button"
                variant="outline"
              >
                <EyeOff className="mr-1.5 h-3.5 w-3.5" />
                {t("sources.ignore")}
              </Button>
              <Button
                disabled={isRunning || mutations.reindex.isPending}
                onClick={bulkReindexSelected}
                size="sm"
                type="button"
                variant="outline"
              >
                <RefreshCw
                  className={
                    mutations.reindex.isPending || isRunning
                      ? "mr-1.5 h-3.5 w-3.5 animate-spin"
                      : "mr-1.5 h-3.5 w-3.5"
                  }
                />
                {isRunning || mutations.reindex.isPending
                  ? t("sources.reindexing")
                  : t("sources.reindex_selected", { count: selectionCount })}
              </Button>
              <Button
                onClick={() => setDeleteOpen(true)}
                size="sm"
                type="button"
                variant="destructive"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                {t("sources.delete_selected", { count: selectionCount })}
              </Button>
            </>
          ) : (
            <span className="text-muted-foreground">
              {itemsTotal > 0
                ? t("sources.items_total", { count: itemsTotal })
                : "\u00A0"}
            </span>
          )}
        </div>
      </div>

      <div className="ui-card-panel flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-auto">
          <Table noWrapper>
            <TableHeader className={STICKY_HEADER_CLASS}>
              <TableRow>
                <TableHead className="w-10 pr-0">
                  <Checkbox
                    aria-label={t("sources.items_select_all")}
                    checked={
                      allPageSelected
                        ? true
                        : somePageSelected
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead>{t("sources.name")}</TableHead>
                <TableHead>{t("sources.status")}</TableHead>
                <TableHead>{t("sources.last_seen")}</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {itemsLoading ? (
                <TableRow>
                  <TableCell colSpan={colSpan}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ) : itemRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    className="py-8 text-center text-muted-foreground"
                    colSpan={colSpan}
                  >
                    {t("sources.no_retrieved_items")}
                  </TableCell>
                </TableRow>
              ) : (
                itemRows.map((item) => (
                  <TableRow
                    className={
                      item.status === "ignored"
                        ? "opacity-50"
                        : selectedIds.has(item.id)
                          ? "bg-muted/40"
                          : undefined
                    }
                    key={item.id}
                  >
                    <TableCell className="pr-0">
                      <Checkbox
                        aria-label={item.title ?? item.adapter_item_key}
                        checked={selectedIds.has(item.id)}
                        onCheckedChange={() => toggleOne(item.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="max-w-md truncate">
                        <Link
                          className="text-primary hover:underline"
                          to={kbSourceItemPath(item.id)}
                        >
                          {item.title ||
                            item.source_url ||
                            item.adapter_item_key}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell className="capitalize">
                      {item.status.replaceAll("_", " ")}
                    </TableCell>
                    <TableCell>
                      {item.last_seen_at
                        ? new Date(item.last_seen_at).toLocaleString()
                        : t("sources.never")}
                    </TableCell>
                    <TableCell className="text-right">
                      <TooltipProvider delayDuration={400}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              aria-label={
                                item.status === "ignored"
                                  ? t("sources.activate")
                                  : t("sources.ignore")
                              }
                              className="group"
                              onClick={() =>
                                mutations.updateItemStatus.mutate({
                                  itemId: item.id,
                                  sourceId: source.id,
                                  status:
                                    item.status === "ignored"
                                      ? "active"
                                      : "ignored",
                                })
                              }
                              size="icon"
                              type="button"
                              variant="ghost"
                            >
                              {item.status === "ignored" ? (
                                <>
                                  <EyeOff className="h-4 w-4 text-muted-foreground/60 group-hover:hidden" />
                                  <Eye className="hidden h-4 w-4 text-green-500 group-hover:block" />
                                </>
                              ) : (
                                <>
                                  <Eye className="h-4 w-4 text-green-500 group-hover:hidden" />
                                  <EyeOff className="hidden h-4 w-4 text-muted-foreground group-hover:block" />
                                </>
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {item.status === "ignored"
                              ? t("sources.activate")
                              : t("sources.ignore")}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            {itemsPage} / {itemsTotalPages}
          </span>
          <Button
            disabled={itemsPage <= 1}
            onClick={() => setItemsPage((p) => Math.max(1, p - 1))}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("list.previous")}
          </Button>
          <Button
            disabled={itemsPage >= itemsTotalPages}
            onClick={() => setItemsPage((p) => p + 1)}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("list.next")}
          </Button>
        </div>
      </div>

      <AlertDialog
        onOpenChange={(open) => !open && setDeleteOpen(false)}
        open={deleteOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("sources.items_delete_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("sources.items_delete_description", {
                count: selectionCount,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteBusy}
              onClick={() => void bulkDeleteSelected()}
            >
              {t("sources.items_delete_confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
