/**
 * List persisted article / FAQ versions and show JSON snapshot for a row.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ScrollArea,
  Skeleton,
  STICKY_HEADER_CLASS,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@engenty/ui-core";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { restoreArticleVersion } from "../api.js";
import {
  articleVersionDetailQueryOptions,
  articleVersionsListQueryOptions,
  faqVersionDetailQueryOptions,
  faqVersionsListQueryOptions,
} from "../queries.js";

export type KbEntityVersionsKind = "article" | "faq";

export interface KbEntityVersionsDialogProps {
  entityId: string;
  kind: KbEntityVersionsKind;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful article restore (refresh editor/detail). */
  onRestored?: () => void;
  open: boolean;
}

export function KbEntityVersionsDialog({
  entityId,
  kind,
  onOpenChange,
  onRestored,
  open,
}: KbEntityVersionsDialogProps) {
  const { t } = useTranslation("kb");
  const queryClient = useQueryClient();
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);

  const listOptions =
    kind === "article"
      ? articleVersionsListQueryOptions(entityId)
      : faqVersionsListQueryOptions(entityId);

  const {
    data: versions = [],
    isLoading: listLoading,
    isError: listError,
  } = useQuery({
    ...listOptions,
    enabled: open && !!entityId,
  });

  useEffect(() => {
    if (!open) {
      setSelectedVersion(null);
      return;
    }
    if (versions.length === 0) {
      return;
    }
    setSelectedVersion((prev) => {
      if (prev !== null && versions.some((x) => x.version === prev)) {
        return prev;
      }
      return versions[0]?.version ?? null;
    });
  }, [open, versions]);

  const detailOptions =
    kind === "article"
      ? articleVersionDetailQueryOptions(entityId, selectedVersion)
      : faqVersionDetailQueryOptions(entityId, selectedVersion);

  const {
    data: detail,
    isLoading: detailLoading,
    isFetching: detailFetching,
  } = useQuery({
    ...detailOptions,
    enabled: open && !!entityId && selectedVersion != null,
  });

  const title =
    kind === "article" ? t("versions.title_article") : t("versions.title_faq");

  const snapshotJson = detail?.snapshot
    ? JSON.stringify(detail.snapshot, null, 2)
    : "";

  const restoreMutation = useMutation({
    mutationFn: (version: number) => restoreArticleVersion(entityId, version),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["kb", "articles", "detail", entityId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["kb", "articles", "versions", entityId],
      });
      await queryClient.invalidateQueries({ queryKey: ["kb", "articles"] });
      toast.success(t("versions.restore_success"));
      onRestored?.();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : t("versions.restore_error")
      );
    },
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b px-4 py-3">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-0 md:flex-row">
          <div className="flex min-h-0 shrink-0 flex-col border-b md:w-52 md:border-r md:border-b-0">
            <ScrollArea className="h-56 md:h-[min(60vh,420px)]">
              {listLoading ? (
                <div className="space-y-2 p-3">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : listError ? (
                <p className="p-3 text-destructive text-sm">
                  {t("versions.load_error")}
                </p>
              ) : versions.length === 0 ? (
                <p className="p-3 text-muted-foreground text-sm">
                  {t("versions.empty")}
                </p>
              ) : (
                <Table noWrapper>
                  <TableHeader className={STICKY_HEADER_CLASS}>
                    <TableRow>
                      <TableHead className="w-14">
                        {t("versions.col_version")}
                      </TableHead>
                      <TableHead>{t("versions.col_saved_at")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {versions.map((row) => (
                      <TableRow
                        className={cn(
                          "cursor-pointer",
                          selectedVersion === row.version && "bg-muted/60"
                        )}
                        key={row.version}
                        onClick={() => setSelectedVersion(row.version)}
                      >
                        <TableCell className="font-mono text-xs">
                          {row.version}
                        </TableCell>
                        <TableCell className="text-xs">
                          {new Date(row.created_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="shrink-0 border-b px-4 py-2 text-muted-foreground text-xs">
              {detailLoading || detailFetching ? (
                <Skeleton className="h-4 w-48" />
              ) : detail ? (
                <span>
                  {t("versions.col_saved_by")}:{" "}
                  <span className="font-mono text-foreground">
                    {detail.created_by ?? t("versions.unknown_author")}
                  </span>
                </span>
              ) : selectedVersion == null ? null : (
                <span>{t("versions.empty_detail")}</span>
              )}
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="p-3">
                {selectedVersion == null ? null : detailLoading ||
                  detailFetching ? (
                  <Skeleton className="h-48 w-full" />
                ) : detail ? (
                  <>
                    <p className="mb-2 font-medium text-sm">
                      {t("versions.snapshot_heading")}
                    </p>
                    <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
                      {snapshotJson}
                    </pre>
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    {t("versions.empty_detail")}
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
        {kind === "article" && selectedVersion != null && detail ? (
          <DialogFooter className="shrink-0 border-t px-4 py-3">
            <Button
              disabled={restoreMutation.isPending}
              onClick={() => restoreMutation.mutate(selectedVersion)}
              type="button"
            >
              {restoreMutation.isPending
                ? t("versions.restoring")
                : t("versions.restore_action", { version: selectedVersion })}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
