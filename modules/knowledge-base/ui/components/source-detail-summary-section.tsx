import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn, Label, Progress, Switch } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { Clock, Play, Square } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { KbSource } from "../../src/schema/types.js";
import { SourceDetailAdapterSettingsPanel } from "./source-detail-adapter-settings-panel.js";

function statusDotColor(status: string): string {
  if (status === "active") {
    return "bg-green-500";
  }
  if (status === "failed") {
    return "bg-destructive";
  }
  if (status === "paused" || status === "disabled") {
    return "bg-amber-500";
  }
  return "bg-muted-foreground/60";
}

function missingItemStrategyLabel(
  strategyId: string,
  t: (key: string) => string
): string {
  const key = `sources.missing_item_strategy.${strategyId}`;
  const label = t(key);
  if (!label.trim() || label === key) {
    return strategyId.replaceAll("_", " ");
  }
  return label;
}

export function SourceDetailSummarySection({
  defaultIntervalMinutes,
  enabledTogglePending,
  onEnabledChange,
  onRunNow,
  onStopRun,
  runPending,
  stopRunPending,
  source,
}: {
  defaultIntervalMinutes: number;
  enabledTogglePending: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onRunNow: () => void;
  onStopRun: () => void;
  runPending: boolean;
  stopRunPending: boolean;
  source: KbSource;
}) {
  const { t } = useTranslation("kb");
  const [runButtonHovered, setRunButtonHovered] = useState(false);

  const sch = source.schedule;
  const scheduleEnabled = Boolean(sch?.enabled);

  const scheduleSummary = useMemo(() => {
    if (!scheduleEnabled) {
      return null;
    }
    if (sch.kind === "cron" && sch.cron_expression?.trim()) {
      return t("sources.scheduler_summary_cron", {
        expression: sch.cron_expression.trim(),
        timezone: sch.timezone ?? "UTC",
      });
    }
    return t("sources.scheduler_summary_interval", {
      minutes: sch.interval_minutes ?? defaultIntervalMinutes,
    });
  }, [defaultIntervalMinutes, scheduleEnabled, sch, t]);

  const nextRunLabel = source.next_run_at
    ? new Date(source.next_run_at).toLocaleString()
    : t("sources.manual");

  const lastRunLabel = source.last_run_at
    ? new Date(source.last_run_at).toLocaleString()
    : t("sources.never");

  // Animate indeterminate progress bar: cycle 0→80→0 so it visually sweeps
  const [progressVal, setProgressVal] = useState(0);
  useEffect(() => {
    if (!runPending) {
      setProgressVal(0);
      return;
    }
    let forward = true;
    const tick = setInterval(() => {
      setProgressVal((v) => {
        if (forward) {
          if (v >= 85) {
            forward = false;
            return v - 2;
          }
          return Math.min(v + 3, 85);
        }
        if (v <= 15) {
          forward = true;
          return v + 2;
        }
        return Math.max(v - 3, 15);
      });
    }, 40);
    return () => clearInterval(tick);
  }, [runPending]);

  return (
    <div className="ui-card-panel overflow-hidden">
      {/* Indeterminate progress bar while run is in-flight */}
      <div
        className={cn(
          "transition-all duration-200",
          runPending ? "h-1" : "h-0"
        )}
      >
        {runPending && (
          <Progress className="h-1 rounded-none" value={progressVal} />
        )}
      </div>

      <div className="divide-y">
        {/* Status + enabled switch */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                statusDotColor(source.status)
              )}
            />
            <span className="font-medium text-sm capitalize">
              {source.status.replaceAll("_", " ")}
            </span>
          </div>
          <span className="text-muted-foreground text-sm">
            {t("sources.last_run")}: {lastRunLabel}
          </span>
          {source.last_error?.trim() ? (
            <span
              className="max-w-xs truncate text-destructive text-sm"
              title={source.last_error}
            >
              {source.last_error.trim()}
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <Label
              className="cursor-pointer text-muted-foreground text-sm"
              htmlFor="kb-source-enabled-switch"
            >
              {t("sources.enabled")}
            </Label>
            <Switch
              checked={source.enabled}
              disabled={enabledTogglePending}
              id="kb-source-enabled-switch"
              onCheckedChange={onEnabledChange}
            />
          </div>
        </div>

        {/* Adapter settings (only rendered when settings exist) */}
        <SourceDetailAdapterSettingsPanel settings={source.settings ?? {}} />

        {/* Missing items + Schedule summary + Run now */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">
              {t("sources.missing_items")}:
            </span>
            <span>
              {missingItemStrategyLabel(source.missing_item_strategy, t)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {scheduleSummary ? (
              <span>
                {scheduleSummary}
                <span className="text-muted-foreground">
                  {" "}
                  · {t("sources.next_run")}: {nextRunLabel}
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">
                {t("sources.manual")} · {t("sources.next_run")}: {nextRunLabel}
              </span>
            )}
          </div>
          <Button
            className={cn(
              "ml-auto shrink-0",
              runPending && runButtonHovered && "border-destructive/40"
            )}
            disabled={stopRunPending}
            onClick={runPending ? onStopRun : onRunNow}
            onMouseEnter={() => setRunButtonHovered(true)}
            onMouseLeave={() => setRunButtonHovered(false)}
            size="sm"
            type="button"
            variant="outline"
          >
            {stopRunPending ? (
              <AnimatedLoaderIcon className="mr-1.5" play="always" size="xs" />
            ) : runPending && runButtonHovered ? (
              <Square className="mr-1.5 h-3.5 w-3.5 fill-destructive text-destructive" />
            ) : runPending ? (
              <AnimatedLoaderIcon className="mr-1.5" play="always" size="xs" />
            ) : (
              <Play className="mr-1.5 h-3.5 w-3.5" />
            )}
            {stopRunPending
              ? t("sources.stopping_run")
              : runPending && runButtonHovered
                ? t("sources.stop_run")
                : runPending
                  ? t("sources.running")
                  : t("sources.run_now")}
          </Button>
        </div>
      </div>
    </div>
  );
}
