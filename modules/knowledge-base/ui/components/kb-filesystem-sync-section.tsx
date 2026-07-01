/**
 * Per-KB settings section for the optional `kb-filesystem-sync` module:
 * shows DB↔storage sync status and offers manual export / import.
 *
 * Degrades gracefully when the module is not installed (its routes 404 → the
 * status query fails and we show an "unavailable" hint instead of the panel).
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import { Button, SettingsFormSection, Skeleton } from "@engenty/ui-core";
import { Download, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import { exportKbSync, getKbSyncStatus, importKbSync } from "../api.js";

export function KbFilesystemSyncSection({ kbId }: { kbId: string }) {
  const { t } = useTranslation("kb");
  const queryClient = useQueryClient();
  const statusKey = ["kb", "sync", "status", kbId];

  const {
    data: status,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    enabled: Boolean(kbId),
    queryFn: ({ signal }) => getKbSyncStatus(kbId, signal),
    queryKey: statusKey,
    retry: false,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: statusKey });
  };

  const exportMutation = useMutation({
    mutationFn: () => exportKbSync(kbId),
    onError: (e) =>
      toast.error(
        e instanceof Error ? e.message : t("filesystem_sync.export_failed")
      ),
    onSuccess: (r) => {
      toast.success(
        t("filesystem_sync.export_done", {
          articles: r.articles,
          categories: r.categories,
        })
      );
      invalidate();
    },
  });

  const importMutation = useMutation({
    mutationFn: () => importKbSync(kbId),
    onError: (e) =>
      toast.error(
        e instanceof Error ? e.message : t("filesystem_sync.import_failed")
      ),
    onSuccess: (r) => {
      toast.success(
        t("filesystem_sync.import_done", {
          articles: r.articles,
          categories: r.categories,
        })
      );
      invalidate();
    },
  });

  const busy = exportMutation.isPending || importMutation.isPending;

  return (
    <SettingsFormSection
      description={t("filesystem_sync.section_description")}
      title={t("filesystem_sync.section_title")}
    >
      <div className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : isError || !status ? (
          <p className="text-muted-foreground text-sm">
            {t("filesystem_sync.status_unavailable")}
          </p>
        ) : (
          <div className="rounded-md border p-3 text-sm">
            <div className="mb-2 flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  status.in_sync ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
              <span className="font-medium">
                {status.in_sync
                  ? t("filesystem_sync.in_sync")
                  : t("filesystem_sync.out_of_sync")}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-muted-foreground">
              <span className="font-medium">
                {t("filesystem_sync.database")}
              </span>
              <span className="font-medium">
                {t("filesystem_sync.storage")}
              </span>
              <span>
                {t("filesystem_sync.counts", {
                  articles: status.db.articles,
                  categories: status.db.categories,
                })}
              </span>
              <span>
                {t("filesystem_sync.counts", {
                  articles: status.storage.articles,
                  categories: status.storage.categories,
                })}
              </span>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy}
            onClick={() => exportMutation.mutate()}
            size="sm"
          >
            <Download aria-hidden className="mr-1.5 h-4 w-4" />
            {exportMutation.isPending
              ? t("filesystem_sync.exporting")
              : t("filesystem_sync.export")}
          </Button>
          <Button
            disabled={busy}
            onClick={() => importMutation.mutate()}
            size="sm"
            variant="outline"
          >
            <Upload aria-hidden className="mr-1.5 h-4 w-4" />
            {importMutation.isPending
              ? t("filesystem_sync.importing")
              : t("filesystem_sync.import")}
          </Button>
          <Button
            disabled={isFetching}
            onClick={() => refetch()}
            size="sm"
            variant="ghost"
          >
            <RefreshCw aria-hidden className="mr-1.5 h-4 w-4" />
            {t("filesystem_sync.refresh")}
          </Button>
        </div>
      </div>
    </SettingsFormSection>
  );
}
