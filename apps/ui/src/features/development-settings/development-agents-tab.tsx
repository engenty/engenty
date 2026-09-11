import {
  useAdminAiThreadStatsQuery,
  useDeleteAllAdminAiThreadsMutation,
} from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
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
  SettingsFormSection,
} from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { RefreshCcw, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import {
  deriveSessionStatsSummary,
  formatRelativeTime,
} from "./derive-session-stats";

interface StatTileProps {
  emphasis?: "default" | "destructive";
  hint?: string;
  label: string;
  value: string;
}

function StatTile({ label, value, hint, emphasis = "default" }: StatTileProps) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </div>
      <div
        className={
          emphasis === "destructive"
            ? "mt-1 font-semibold text-2xl text-destructive tabular-nums"
            : "mt-1 font-semibold text-2xl tabular-nums"
        }
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-0.5 text-muted-foreground text-xs">{hint}</div>
      ) : null}
    </div>
  );
}

export function DevelopmentAgentsTab() {
  const { t } = useTranslation("common");
  const statsQuery = useAdminAiThreadStatsQuery();
  const clearAllMutation = useDeleteAllAdminAiThreadsMutation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastClearResult, setLastClearResult] = useState<{
    deleted_count: number;
    runs_deleted_count: number;
    remaining_threads: number;
  } | null>(null);

  const summary = deriveSessionStatsSummary(statsQuery.data?.stats ?? null);
  const isBusy = clearAllMutation.isPending;

  const runClearAll = useCallback(async () => {
    try {
      const result = await clearAllMutation.mutateAsync();
      setLastClearResult(result);
      setConfirmOpen(false);
    } catch {
      /* surfaced via mutation isError */
    }
  }, [clearAllMutation]);

  return (
    <SettingsFormSection
      description={t("settings.development.sessions.description")}
      title={t("settings.development.sessions.title")}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          hint={t("settings.development.sessions.idleHint", {
            count: summary.byStatus.idle,
          })}
          label={t("settings.development.sessions.totalSessions")}
          value={statsQuery.isLoading ? "—" : String(summary.totalSessions)}
        />
        <StatTile
          hint={t("settings.development.sessions.activeHint")}
          label={t("settings.development.sessions.activeSessions")}
          value={statsQuery.isLoading ? "—" : String(summary.activeSessions)}
        />
        <StatTile
          emphasis={summary.failedSessions > 0 ? "destructive" : "default"}
          label={t("settings.development.sessions.failedSessions")}
          value={statsQuery.isLoading ? "—" : String(summary.failedSessions)}
        />
        <StatTile
          hint={t("settings.development.sessions.runsHint")}
          label={t("settings.development.sessions.totalRuns")}
          value={statsQuery.isLoading ? "—" : String(summary.totalRuns)}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <div className="text-muted-foreground text-sm">
          {t("settings.development.sessions.lastMessage")}:{" "}
          <span className="font-medium text-foreground">
            {statsQuery.isLoading
              ? "—"
              : formatRelativeTime(summary.lastMessageAt)}
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            disabled={statsQuery.isFetching}
            onClick={() => void statsQuery.refetch()}
            size="sm"
            type="button"
            variant="outline"
          >
            {statsQuery.isFetching ? (
              <AnimatedLoaderIcon play="always" size="xs" />
            ) : (
              <RefreshCcw className="h-3.5 w-3.5" />
            )}
            {t("settings.development.refresh")}
          </Button>
          <Button
            className="text-destructive hover:text-destructive"
            disabled={isBusy || summary.totalSessions === 0}
            onClick={() => setConfirmOpen(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("settings.development.sessions.clearAll")}
          </Button>
        </div>
      </div>

      {statsQuery.isError ? (
        <p className="text-destructive text-sm">
          {t("settings.development.sessions.loadFailed")}
        </p>
      ) : null}

      {clearAllMutation.isError ? (
        <p className="text-destructive text-sm">
          {t("settings.development.sessions.clearFailed")}
          {clearAllMutation.error instanceof Error
            ? `: ${clearAllMutation.error.message}`
            : null}
        </p>
      ) : null}

      {lastClearResult && !clearAllMutation.isError ? (
        <p
          className={
            lastClearResult.remaining_threads > 0
              ? "text-destructive text-sm"
              : "text-muted-foreground text-sm"
          }
        >
          {lastClearResult.remaining_threads > 0
            ? t("settings.development.sessions.clearedPartial", {
                deleted: lastClearResult.deleted_count,
                remaining: lastClearResult.remaining_threads,
              })
            : t("settings.development.sessions.clearedSummary", {
                count: lastClearResult.deleted_count,
              })}
        </p>
      ) : null}

      <AlertDialog
        onOpenChange={(open) => !open && setConfirmOpen(false)}
        open={confirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.development.sessions.confirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.development.sessions.confirmDescription", {
                count: summary.totalSessions,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBusy}>
              {t("actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isBusy}
              onClick={(event) => {
                event.preventDefault();
                void runClearAll();
              }}
            >
              {isBusy ? (
                <AnimatedLoaderIcon
                  className="mr-1.5"
                  play="always"
                  size="xs"
                />
              ) : (
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              {t("settings.development.sessions.clearAll")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsFormSection>
  );
}
