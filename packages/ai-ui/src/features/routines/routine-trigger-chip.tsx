// The routine's primary wake source as one chip. With several triggers the
// first self-waking one (schedule/event) wins; manual/agent pressability is
// not worth a chip.
import { useMemo } from "react";
import type { RoutineDto, RoutineTriggerDto } from "./routines-api.js";
import { cronToHumanLabel } from "./schedule-cron.js";

export interface RoutineTriggerChipProps {
  locale?: string;
  routine: RoutineDto;
}

function triggerLabel(
  trigger: RoutineTriggerDto,
  locale: string
): string | null {
  if (trigger.kind === "event") {
    return trigger.provider_id === "webhook"
      ? "Webhook"
      : (trigger.resource ?? "Event");
  }
  if (trigger.kind === "schedule" && trigger.cron) {
    return cronToHumanLabel(trigger.cron, locale, trigger.timezone);
  }
  return null;
}

export function RoutineTriggerChip({
  routine,
  locale = "en",
}: RoutineTriggerChipProps) {
  const label = useMemo(() => {
    for (const trigger of routine.triggers ?? []) {
      const text = triggerLabel(trigger, locale);
      if (text) {
        return text;
      }
    }
    return null;
  }, [routine.triggers, locale]);

  if (!label) {
    return null;
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">
      {label}
    </span>
  );
}
