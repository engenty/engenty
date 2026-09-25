// The routine's destinations, as rows — same inventory the outcome node lists.
import { useTranslation } from "@engenty/i18n/ui";
import { Badge } from "@engenty/ui-core";
import { Flag } from "lucide-react";
import { routineOutcomes } from "./routine-shape.js";
import type { RoutineDto } from "./routines-api.js";

export interface RoutineOutcomeListProps {
  locale?: string;
  onEdit?: () => void;
  routine: RoutineDto;
}

export function RoutineOutcomeList({
  locale = "en",
  onEdit,
  routine,
}: RoutineOutcomeListProps) {
  const { t } = useTranslation("ai-ui");
  const bindings = routineOutcomes(routine, locale);

  if (bindings.length === 0) {
    const empty = (
      <p className="text-muted-foreground text-xs">
        {t("routines.outcomes.empty")}
      </p>
    );
    if (!onEdit) {
      return empty;
    }
    return (
      <button
        className="ui-card-panel ui-card-interactive w-full px-3 py-2.5 text-left"
        onClick={onEdit}
        type="button"
      >
        {empty}
      </button>
    );
  }

  const list = (
    <ul className="ui-card-panel divide-y divide-border">
      {bindings.map((binding) => (
        <li
          className="flex min-w-0 items-center gap-2.5 px-3 py-2 text-sm"
          key={binding.id}
        >
          <Flag className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium text-sm">{binding.label}</span>
            <span className="text-muted-foreground text-xs">
              {" · "}
              {binding.modeLabel}
            </span>
          </span>
          {binding.enabled ? null : (
            <Badge variant="outline">{t("routines.outcomes.paused")}</Badge>
          )}
        </li>
      ))}
    </ul>
  );

  if (!onEdit) {
    return list;
  }

  return (
    <button className="block w-full text-left" onClick={onEdit} type="button">
      {list}
    </button>
  );
}
