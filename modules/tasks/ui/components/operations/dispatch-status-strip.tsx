import { useTranslation } from "@engenty/i18n/ui";
import { Badge, Button, Card, cn, Skeleton } from "@engenty/ui-core";
import { Play } from "lucide-react";
import type { DispatchStatus } from "../../lib/operations-api.js";

function StatusDot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        on ? "bg-emerald-500" : "bg-amber-500"
      )}
    />
  );
}

function formatAge(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  if (seconds < 3600) {
    return `${Math.round(seconds / 60)}m`;
  }
  return `${Math.round(seconds / 3600)}h`;
}

interface DispatchStatusStripProps {
  coordinator:
    | { last_run_at: string | null; last_result: string | null }
    | null
    | undefined;
  dispatch: DispatchStatus | undefined;
  onRunCoordinator: () => void;
  runPending: boolean;
}

export function DispatchStatusStrip({
  coordinator,
  dispatch,
  onRunCoordinator,
  runPending,
}: DispatchStatusStripProps) {
  const { t } = useTranslation("tasks");

  if (!dispatch) {
    return (
      <Card variant="form">
        <div className="grid grid-cols-2 gap-4 p-4 md:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton className="h-10 w-full" key={i} />
          ))}
        </div>
      </Card>
    );
  }

  const queueLabel = dispatch.queue
    ? dispatch.queue.depth > 0
      ? `${t("operations.dispatch.queueDepth", { count: dispatch.queue.depth })}${
          dispatch.queue.oldest_msg_age_seconds == null
            ? ""
            : ` · ${t("operations.dispatch.oldestMessage", { age: formatAge(dispatch.queue.oldest_msg_age_seconds) })}`
        }`
      : t("operations.dispatch.queueEmpty")
    : t("operations.dispatch.queueUnconfigured");

  const coordinatorTime = coordinator?.last_run_at
    ? t("operations.coordinator.lastRun", {
        when: new Date(coordinator.last_run_at).toLocaleTimeString(),
      })
    : t("operations.coordinator.neverRan");

  return (
    <Card variant="form">
      <div className="grid grid-cols-2 gap-4 p-4 md:grid-cols-4">
        {/* Dispatcher status */}
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">
            {t("operations.dispatch.label")}
          </span>
          <span className="flex items-center gap-1.5 font-medium text-sm">
            <StatusDot on={dispatch.enabled} />
            {dispatch.enabled
              ? t("operations.dispatch.enabled")
              : t("operations.dispatch.disabled")}
          </span>
        </div>

        {/* Queue depth */}
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">
            {t("operations.dispatch.label")}
          </span>
          <span className="text-sm">{queueLabel}</span>
        </div>

        {/* Conductor */}
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">
            {t("operations.coordinator.label")}
          </span>
          <span className="text-sm">{coordinatorTime}</span>
          {coordinator?.last_result ? (
            <Badge className="w-fit font-normal text-xxs" variant="secondary">
              {coordinator.last_result}
            </Badge>
          ) : null}
        </div>

        {/* Run coordinator now */}
        <div className="flex flex-col items-start justify-center gap-1">
          <Button
            disabled={runPending}
            onClick={onRunCoordinator}
            size="sm"
            type="button"
            variant="outline"
          >
            <Play className="mr-1.5 size-3" />
            {runPending
              ? t("operations.coordinator.running")
              : t("operations.coordinator.runNow")}
          </Button>
        </div>
      </div>
    </Card>
  );
}
