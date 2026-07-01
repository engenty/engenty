import { useTranslation } from "@engenty/i18n/ui";
import { Button, Label, Switch } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { Edit, Play } from "lucide-react";
import { useCallback, useMemo } from "react";
import type { KbSource } from "../../src/schema/types.js";

export function SourceDetailSchedulerSection({
  defaultIntervalMinutes,
  onEdit,
  onRunNow,
  onScheduleEnabledChange,
  runPending,
  scheduleTogglePending,
  source,
}: {
  defaultIntervalMinutes: number;
  onEdit: () => void;
  onRunNow: () => void;
  onScheduleEnabledChange: (enabled: boolean) => void;
  runPending: boolean;
  scheduleTogglePending: boolean;
  source: KbSource;
}) {
  const { t } = useTranslation("kb");
  const sch = source.schedule;
  const enabled = Boolean(sch?.enabled);

  const summaryLine = useMemo(() => {
    if (!enabled) {
      return null;
    }
    if (sch.kind === "cron" && (sch.cron_expression?.trim() ?? "")) {
      return t("sources.scheduler_summary_cron", {
        expression: sch.cron_expression?.trim() ?? "",
        timezone: sch.timezone ?? "UTC",
      });
    }
    const mins = sch.interval_minutes ?? defaultIntervalMinutes;
    return t("sources.scheduler_summary_interval", { minutes: mins });
  }, [defaultIntervalMinutes, enabled, sch, t]);

  const onSwitch = useCallback(
    (next: boolean) => {
      onScheduleEnabledChange(next);
    },
    [onScheduleEnabledChange]
  );

  const nextRunLabel = source.next_run_at
    ? new Date(source.next_run_at).toLocaleString()
    : t("sources.manual");

  return (
    <div className="ui-canvas-panel rounded-lg border-0 bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="font-semibold text-sm">
            {t("sources.section_schedule")}
          </h2>
          <p className="text-muted-foreground text-sm">
            {t("sources.section_schedule_desc")}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Button onClick={onEdit} size="sm" type="button">
            <Edit className="mr-1.5 h-4 w-4" />
            {t("article.edit")}
          </Button>
          <Button
            disabled={runPending}
            onClick={onRunNow}
            size="sm"
            type="button"
            variant="outline"
          >
            {runPending ? (
              <AnimatedLoaderIcon className="mr-1.5" play="always" size="sm" />
            ) : (
              <Play className="mr-1.5 h-4 w-4" />
            )}
            {runPending ? t("sources.running") : t("sources.run_now")}
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-row items-center justify-between gap-4 rounded-md border bg-muted/30 px-3 py-3">
        <Label
          className="cursor-pointer text-sm leading-none"
          htmlFor="kb-source-detail-schedule-enabled"
        >
          {t("sources.refresh_on_schedule")}
        </Label>
        <Switch
          checked={enabled}
          disabled={scheduleTogglePending}
          id="kb-source-detail-schedule-enabled"
          onCheckedChange={onSwitch}
        />
      </div>

      {enabled && summaryLine ? (
        <p className="mt-3 text-muted-foreground text-sm">{summaryLine}</p>
      ) : null}

      <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-2">
        <span className="shrink-0 text-muted-foreground text-sm">
          {t("sources.next_run")}
        </span>
        <span className="text-sm">{nextRunLabel}</span>
      </div>
    </div>
  );
}
