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
  const label = useMemo(() => {
    if (routine.kind === "event") {
      return routine.provider_id === "webhook"
        ? "Webhook"
        : (routine.resource ?? "Event");
    }
    return routine.cron ? cronToHumanLabel(routine.cron, locale) : null;
  }, [
    routine.cron,
    routine.kind,
    routine.provider_id,
    routine.resource,
    locale,
  ]);

  if (!label) {
    return null;
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">
      {label}
    </span>
  );
}
