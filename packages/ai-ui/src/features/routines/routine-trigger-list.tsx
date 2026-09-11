// The routine's wake sources, as rows.
//
// The canvas shows the same wake sources as nodes in the picture; this is the
// readable inventory under it, with the schedule spelled out. Same derivation
// (routineTriggers), so the two can't disagree.
import { Badge } from "@engenty/ui-core";
import {
  Bot,
  CalendarClock,
  MousePointerClick,
  Webhook,
  Zap,
} from "lucide-react";
import { routineTriggers } from "./routine-shape.js";
import type { RoutineDto } from "./routines-api.js";

const TRIGGER_ICON = {
  agent: Bot,
  event: Zap,
  manual: MousePointerClick,
  schedule: CalendarClock,
} as const;

export interface RoutineTriggerListProps {
  locale?: string;
  routine: RoutineDto;
}

export function RoutineTriggerList({
  locale = "en",
  routine,
}: RoutineTriggerListProps) {
  const isDe = locale.startsWith("de");
  const triggers = routineTriggers(routine, locale);

  return (
    <ul className="ui-card-panel divide-y divide-border">
      {triggers.map((trigger) => {
        const Icon =
          trigger.kind === "event" && trigger.label === "Webhook"
            ? Webhook
            : TRIGGER_ICON[trigger.kind];
        return (
          <li
            className="flex min-w-0 items-center gap-2.5 px-3 py-2 text-sm"
            key={trigger.id}
          >
            <Icon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="shrink-0 font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
              {trigger.label}
            </span>
            {trigger.detail ? (
              <span className="truncate text-foreground text-xs">
                {trigger.detail}
              </span>
            ) : null}
            {trigger.enabled ? null : (
              <Badge className="ml-auto" variant="outline">
                {isDe ? "Pausiert" : "Paused"}
              </Badge>
            )}
          </li>
        );
      })}
    </ul>
  );
}
