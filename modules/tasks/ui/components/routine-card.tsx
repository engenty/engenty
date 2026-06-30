// Card row for a routine — mirrors the TaskCard visual language:
// enabled-dot dropdown left, name + source badge inline, trigger/agent meta
// line, hover-revealed Run/Edit/Delete actions on the right.
import {
  type RoutineDto,
  RoutineTriggerChip,
  useDeleteCustomRoutineMutation,
  usePatchRoutineStateMutation,
  useRunRoutineNowMutation,
} from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { Bot } from "lucide-react";
import { useState } from "react";
import { RoutineCardActions } from "./routine-card-actions.js";
import { RoutineEnabledDot } from "./routine-enabled-dot.js";

const SOURCE_BADGE_CLASSES: Record<RoutineDto["source"], string> = {
  builtin: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  custom: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  module: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

interface RoutineCardProps {
  locale: string;
  onClick?: (routine: RoutineDto) => void;
  onEdit?: (routine: RoutineDto) => void;
  routine: RoutineDto;
}

export function RoutineCard({
  routine,
  locale,
  onClick,
  onEdit,
}: RoutineCardProps) {
  const { t } = useTranslation("tasks");
  const [isHovered, setIsHovered] = useState(false);
  const patchMutation = usePatchRoutineStateMutation();
  const runMutation = useRunRoutineNowMutation();
  const deleteMutation = useDeleteCustomRoutineMutation();
  const isCustom = routine.source === "custom";

  const lastRunLabel = routine.last_run_at
    ? t("routines.list.lastRun", {
        date: new Date(routine.last_run_at).toLocaleDateString(locale),
        result: routine.last_result?.startsWith("error:")
          ? t("routines.detail.failed")
          : t("routines.detail.success"),
      })
    : t("routines.detail.neverExecuted");

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // Ignore clicks on inner actions; the card itself carries role="button".
    const action = target.closest('button, [role="button"]');
    if (!action || action === e.currentTarget) {
      onClick?.(routine);
    }
  };

  return (
    <div
      className={cn(
        "relative flex select-none items-center gap-4 rounded-lg border bg-card p-3 pr-28",
        onClick && "cursor-pointer transition-colors hover:border-primary/50"
      )}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onClick?.(routine);
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <RoutineCardActions
        isHovered={isHovered}
        isRunning={runMutation.isPending}
        onDelete={
          isCustom ? () => deleteMutation.mutateAsync(routine.id) : undefined
        }
        onEdit={isCustom && onEdit ? () => onEdit(routine) : undefined}
        onRun={() => runMutation.mutate(routine.id)}
        routine={routine}
      />

      <RoutineEnabledDot
        enabled={routine.enabled}
        onChange={(enabled) =>
          patchMutation.mutate({ id: routine.id, patch: { enabled } })
        }
      />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate font-medium">{routine.name}</span>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs",
              SOURCE_BADGE_CLASSES[routine.source]
            )}
          >
            {t(`routines.detail.source.${routine.source}`)}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-muted-foreground text-xs">
          <RoutineTriggerChip locale={locale} routine={routine} />
          {routine.agent_id ? (
            <span className="inline-flex max-w-full items-center gap-1 truncate">
              <Bot className="size-3 shrink-0" />
              <span className="truncate">{routine.agent_id}</span>
            </span>
          ) : null}
          <span>{lastRunLabel}</span>
        </div>
      </div>
    </div>
  );
}
