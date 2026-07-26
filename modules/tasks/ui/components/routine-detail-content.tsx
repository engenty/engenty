// Body of the routine detail page: badge, toggle, triggers (CTAs live in topbar).
import {
  type RoutineDto,
  RoutineTriggerChip,
  usePatchRoutineStateMutation,
} from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { Switch } from "@engenty/ui-core";
import { Calendar } from "lucide-react";
import { RoutineDetailSections } from "./routine-detail-sections.js";

const SOURCE_BADGE_CLASSES: Record<RoutineDto["source"], string> = {
  custom: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  module: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

export interface RoutineDetailContentProps {
  locale: string;
  routine: RoutineDto;
}

export function RoutineDetailContent({
  routine,
  locale,
}: RoutineDetailContentProps) {
  const { t } = useTranslation("tasks");
  const patchMutation = usePatchRoutineStateMutation();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs ${SOURCE_BADGE_CLASSES[routine.source]}`}
        >
          {t(`routines.detail.source.${routine.source}`)}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">
            {t("routines.detail.active")}
          </span>
          <Switch
            checked={
              patchMutation.isPending ? !routine.enabled : routine.enabled
            }
            disabled={patchMutation.isPending}
            onCheckedChange={(checked) =>
              patchMutation.mutate({
                id: routine.id,
                patch: { enabled: checked },
              })
            }
          />
        </div>
      </div>

      <div className="space-y-1">
        <h1 className="font-semibold text-2xl tracking-tight">
          {routine.name}
        </h1>
        <p className="text-muted-foreground text-sm">
          {routine.description || t("routines.detail.noDescription")}
        </p>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
          {t("routines.detail.triggers")}
        </h4>
        <div className="ui-canvas-panel flex items-center gap-2 rounded-lg bg-card p-3">
          <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <RoutineTriggerChip locale={locale} routine={routine} />
          </div>
        </div>
        {routine.next_due_at && (
          <p className="text-muted-foreground text-xs tabular-nums">
            {t("routines.detail.nextExecution", {
              time: new Date(routine.next_due_at).toLocaleString(),
            })}
          </p>
        )}
      </div>

      {/* Webhook URL — external systems POST here to fire the trigger */}
      {routine.provider_id === "webhook" && routine.webhook_secret && (
        <div className="space-y-2">
          <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
            {t("routines.detail.webhookUrl")}
          </h4>
          <div className="ui-canvas-panel select-all break-all rounded-lg bg-card p-3 font-mono text-xs">
            {`${window.location.origin}/api/tasks/trigger-hooks/${routine.id}/${routine.webhook_secret}`}
          </div>
          <p className="text-muted-foreground text-xs">
            {t("routines.detail.webhookHint")}
          </p>
        </div>
      )}

      <RoutineDetailSections routine={routine} />
    </div>
  );
}
