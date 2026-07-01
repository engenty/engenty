import { useTranslation } from "@engenty/i18n/ui";
import { Card, cn, Skeleton } from "@engenty/ui-core";
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
  dispatch: DispatchStatus | undefined;
}

export function DispatchStatusStrip({ dispatch }: DispatchStatusStripProps) {
  const { t } = useTranslation("tasks");

  if (!dispatch) {
    return (
      <Card variant="form">
        <div className="grid grid-cols-2 gap-4 p-4">
          {Array.from({ length: 2 }, (_, i) => (
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

  return (
    <Card variant="form">
      <div className="grid grid-cols-2 gap-4 p-4">
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

        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">
            {t("operations.dispatch.queueLabel")}
          </span>
          <span className="text-sm">{queueLabel}</span>
        </div>
      </div>
    </Card>
  );
}
