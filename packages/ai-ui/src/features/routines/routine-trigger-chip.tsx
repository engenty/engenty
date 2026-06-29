import { X } from "lucide-react";
import { useMemo } from "react";
import type { RoutineDto } from "./routines-api.js";
import { cronToHumanLabel } from "./schedule-cron.js";

export interface RoutineTriggerChipProps {
  locale?: string;
  onClearOverride?: () => void;
  routine: RoutineDto;
}

export function RoutineTriggerChip({
  routine,
  onClearOverride,
  locale = "en",
}: RoutineTriggerChipProps) {
  const isDe = locale.startsWith("de");

  const chips = useMemo(() => {
    if (routine.schedule_override) {
      return [
        {
          cron: routine.schedule_override,
          label: cronToHumanLabel(routine.schedule_override, locale),
          isOverride: true,
        },
      ];
    }
    const schedules =
      routine.schedules?.length > 0 ? routine.schedules : [routine.schedule];
    return schedules.map((s) => ({
      cron: s,
      label: cronToHumanLabel(s, locale),
      isOverride: false,
    }));
  }, [routine.schedule, routine.schedule_override, routine.schedules, locale]);

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip, idx) => (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-xs ${
            chip.isOverride
              ? "border border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400"
              : "bg-muted text-muted-foreground"
          }`}
          key={`${chip.cron}-${idx}`}
        >
          {chip.label}
          {chip.isOverride && onClearOverride && (
            <button
              className="ml-0.5 rounded-full p-0.5 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onClearOverride();
              }}
              title={
                isDe ? "Zeitplan-Override löschen" : "Clear schedule override"
              }
              type="button"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
