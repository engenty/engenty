// Body of the routine detail page: badge, toggle, actions, triggers.
import {
  type RoutineDto,
  RoutineTriggerChip,
  usePatchRoutineStateMutation,
  useRunRoutineNowMutation,
} from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, Switch } from "@engenty/ui-core";
import { Calendar, Edit, Loader2, Play, Trash2 } from "lucide-react";
import { RoutineDetailSections } from "./routine-detail-sections.js";

const SOURCE_BADGE_CLASSES: Record<RoutineDto["source"], string> = {
  builtin: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  custom: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  module: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

export interface RoutineDetailContentProps {
  locale: string;
  onDelete: () => void;
  onEdit: () => void;
  routine: RoutineDto;
}

export function RoutineDetailContent({
  routine,
  locale,
  onEdit,
  onDelete,
}: RoutineDetailContentProps) {
  const { t } = useTranslation("tasks");
  const patchMutation = usePatchRoutineStateMutation();
  const runMutation = useRunRoutineNowMutation();
  const isCustom = routine.source === "custom";

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

      <div className="flex flex-wrap gap-2">
        <Button
          className="gap-2 font-medium"
          disabled={runMutation.isPending || !routine.enabled}
          onClick={() => runMutation.mutate(routine.id)}
          size="sm"
          type="button"
        >
          {runMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5 fill-current" />
          )}
          {t("routines.detail.runNow")}
        </Button>
        {isCustom && (
          <Button
            className="gap-1.5"
            onClick={onEdit}
            size="sm"
            variant="outline"
          >
            <Edit className="h-3.5 w-3.5" />
            {t("routines.detail.edit")}
          </Button>
        )}
        {isCustom && (
          <Button
            className="gap-1.5 text-destructive hover:bg-destructive/10"
            onClick={onDelete}
            size="sm"
            variant="outline"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("routines.detail.delete")}
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
          {t("routines.detail.triggers")}
        </h4>
        <div className="flex items-center gap-2 rounded-lg border bg-card p-3">
          <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <RoutineTriggerChip
              locale={locale}
              onClearOverride={() =>
                patchMutation.mutate({
                  id: routine.id,
                  patch: { schedule_override: null },
                })
              }
              routine={routine}
            />
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

      <RoutineDetailSections routine={routine} />
    </div>
  );
}
