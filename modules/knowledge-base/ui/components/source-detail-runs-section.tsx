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
  cn,
  STICKY_HEADER_CLASS,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@engenty/ui-core";
import { Copy } from "lucide-react";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import type { KbSourceRun } from "../../src/schema/types.js";
import { parseRunItemLogs } from "../../src/sources/source-run-item-log.js";
import { SourceDetailRunItemLogs } from "./source-detail-run-item-logs.js";

const RUN_TABLE_COLUMN_COUNT = 5;

function runErrorTypeLabel(
  metadata: Record<string, unknown> | undefined
): string | null {
  const name = metadata?.error_name;
  return typeof name === "string" && name.trim().length > 0 ? name : null;
}

export interface SourceDetailRunsSectionProps {
  clearRunsMutation: {
    isPending: boolean;
    mutate: (
      sourceId: string,
      options?: {
        onError?: (error: Error) => void;
        onSuccess?: () => void;
      }
    ) => void;
  };
  runs: KbSourceRun[];
  sourceId: string;
}

export function SourceDetailRunsSection({
  runs,
  sourceId,
  clearRunsMutation,
}: SourceDetailRunsSectionProps) {
  const { t } = useTranslation("kb");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const onConfirmClear = () => {
    clearRunsMutation.mutate(sourceId, {
      onError: (err) => {
        toast.error(
          err instanceof Error ? err.message : t("sources.save_failed")
        );
      },
      onSuccess: () => {
        toast.success(t("sources.runs_cleared"));
      },
    });
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-sm">{t("sources.recent_runs")}</h2>
        {runs.length > 0 ? (
          <AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
            <Button
              disabled={clearRunsMutation.isPending}
              onClick={() => setConfirmOpen(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("sources.clear_runs")}
            </Button>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("sources.clear_runs_confirm_title")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("sources.clear_runs_confirm_desc")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel type="button">
                  {t("actions.cancel")}
                </AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={clearRunsMutation.isPending}
                  onClick={() => onConfirmClear()}
                  type="button"
                >
                  {t("sources.clear_runs")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
      {runs.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("sources.no_recent_runs")}
        </p>
      ) : (
        <div className="ui-canvas-panel rounded-lg border-0 bg-card">
          <div className="overflow-x-auto">
            <Table noWrapper>
              <TableHeader className={STICKY_HEADER_CLASS}>
                <TableRow>
                  <TableHead>{t("sources.run_started")}</TableHead>
                  <TableHead>{t("sources.run_trigger")}</TableHead>
                  <TableHead>{t("sources.run_status")}</TableHead>
                  <TableHead>{t("sources.run_counts")}</TableHead>
                  <TableHead className="min-w-[12rem]">
                    {t("sources.run_message")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => {
                  const errorType = runErrorTypeLabel(run.metadata);
                  const itemLogs = parseRunItemLogs(run.metadata);
                  const message =
                    run.error?.trim() ??
                    (run.status === "failed"
                      ? t("sources.run_error_unknown")
                      : null);

                  return (
                    <Fragment key={run.id}>
                      <TableRow>
                        <TableCell>
                          {run.started_at
                            ? new Date(run.started_at).toLocaleString()
                            : "—"}
                        </TableCell>
                        <TableCell>{run.trigger}</TableCell>
                        <TableCell
                          className={cn(
                            run.status === "failed" &&
                              "font-medium text-destructive"
                          )}
                        >
                          {run.status}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {t("sources.run_counts_summary", {
                            created: run.created_items,
                            skipped: run.skipped_items,
                            updated: run.updated_items,
                          })}
                        </TableCell>
                        <TableCell className="max-w-xl align-top">
                          {message ? (
                            <div className="flex gap-2">
                              <div className="min-w-0 flex-1 space-y-1">
                                <p
                                  className="break-words text-muted-foreground text-sm leading-snug"
                                  title={message}
                                >
                                  {message}
                                </p>
                                {run.status === "failed" && errorType ? (
                                  <p className="text-muted-foreground text-xs">
                                    {t("sources.run_error_type", {
                                      name: errorType,
                                    })}
                                  </p>
                                ) : null}
                              </div>
                              <Button
                                aria-label={t("sources.run_message_copy")}
                                className="h-8 w-8 shrink-0 bg-background/80 text-muted-foreground"
                                onClick={async () => {
                                  const typeLine =
                                    run.status === "failed" && errorType
                                      ? `\n${t("sources.run_error_type", { name: errorType })}`
                                      : "";
                                  const payload = `${message}${typeLine}`;
                                  try {
                                    await navigator.clipboard.writeText(
                                      payload
                                    );
                                    toast.success(
                                      t("sources.run_message_copied")
                                    );
                                  } catch {
                                    toast.error(
                                      t("sources.run_message_copy_failed")
                                    );
                                  }
                                }}
                                size="icon"
                                type="button"
                                variant="ghost"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                      {itemLogs.length > 0 ? (
                        <TableRow className="hover:bg-transparent">
                          <TableCell
                            className="border-t-0 bg-muted/15 px-4 py-3"
                            colSpan={RUN_TABLE_COLUMN_COUNT}
                          >
                            <SourceDetailRunItemLogs metadata={run.metadata} />
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
