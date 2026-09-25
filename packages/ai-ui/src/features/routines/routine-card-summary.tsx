// The routine at a glance, under its name on a list row: the short summary
// (the same `description` the detail page prints under its title), what wakes
// it, and where a fire delivers ("Zustellung"). Without destinations the
// report floor says what a run leaves behind — the detail page's fallback.
import { useTranslation } from "@engenty/i18n/ui";
import { Flag, Zap } from "lucide-react";
import { routineOutcomeLine, routineTriggerLine } from "./routine-shape.js";
import type { RoutineDto } from "./routines-api.js";

export interface RoutineCardSummaryProps {
  locale?: string;
  routine: RoutineDto;
}

export function RoutineCardSummary({
  locale = "en",
  routine,
}: RoutineCardSummaryProps) {
  const { t } = useTranslation("ai-ui");
  const triggers = routineTriggerLine(routine, locale);
  const outcomes =
    routineOutcomeLine(routine, locale) ??
    t(`routines.form.reportModes.${routine.report}`);

  return (
    <div className="min-w-0 space-y-1">
      {routine.description ? (
        <p className="line-clamp-2 break-words text-foreground text-xs leading-relaxed">
          {routine.description}
        </p>
      ) : null}
      <p
        className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs"
        title={t("routines.card.triggers")}
      >
        <Zap
          aria-hidden
          className="size-3 shrink-0 text-amber-600 dark:text-amber-400"
          strokeWidth={1.75}
        />
        <span className="truncate">
          {triggers ?? t("routines.card.noTrigger")}
        </span>
      </p>
      <p
        className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs"
        title={t("routines.outcomes.title")}
      >
        <Flag
          aria-hidden
          className="size-3 shrink-0 text-violet-600 dark:text-violet-400"
          strokeWidth={1.75}
        />
        <span className="truncate">{outcomes}</span>
      </p>
    </div>
  );
}
