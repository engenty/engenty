import { useMemo } from "react";
import type { RoutineDto } from "./routines-api.js";
import { cronToHumanLabel } from "./schedule-cron.js";

export interface RoutineTriggerChipProps {
  locale?: string;
  routine: RoutineDto;
}

export function RoutineTriggerChip({
  routine,
  locale = "en",
}: RoutineTriggerChipProps) {
  const label = useMemo(
    () => (routine.cron ? cronToHumanLabel(routine.cron, locale) : null),
    [routine.cron, locale]
  );

  if (!label) {
    return null;
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">
      {label}
    </span>
  );
}
