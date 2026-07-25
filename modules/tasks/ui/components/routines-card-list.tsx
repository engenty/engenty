// Card-list view for routines, sectioned like TasksGroupedList:
// custom routines first, then "System" (module) when present.
import type { RoutineDto } from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { Skeleton } from "@engenty/ui-core";
import { AlertCircle } from "lucide-react";
import { useMemo } from "react";
import { RoutineCard } from "./routine-card.js";

interface RoutinesCardListProps {
  isError?: boolean;
  isPending?: boolean;
  locale: string;
  onEditRoutine?: (routine: RoutineDto) => void;
  onSelectRoutine?: (routine: RoutineDto) => void;
  routines: RoutineDto[];
}

function RoutinesSection({
  emptyHint,
  locale,
  onEdit,
  onSelect,
  routines,
  title,
}: {
  emptyHint?: string;
  locale: string;
  onEdit?: (routine: RoutineDto) => void;
  onSelect?: (routine: RoutineDto) => void;
  routines: RoutineDto[];
  /** Optional section label — omit when the page header already names the list. */
  title?: string;
}) {
  return (
    <div className="space-y-3">
      {title ? <h3 className="font-medium text-lg">{title}</h3> : null}
      {routines.length === 0 ? (
        emptyHint ? (
          <p className="text-muted-foreground text-sm">{emptyHint}</p>
        ) : null
      ) : (
        <div className="space-y-2">
          {routines.map((routine) => (
            <RoutineCard
              key={routine.id}
              locale={locale}
              onClick={onSelect}
              onEdit={onEdit}
              routine={routine}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function RoutinesCardList({
  isError = false,
  isPending = false,
  locale,
  onEditRoutine,
  onSelectRoutine,
  routines,
}: RoutinesCardListProps) {
  const { t } = useTranslation("tasks");

  const { customRoutines, systemRoutines } = useMemo(
    () => ({
      customRoutines: routines.filter((r) => r.source === "custom"),
      systemRoutines: routines.filter((r) => r.source !== "custom"),
    }),
    [routines]
  );

  if (isPending) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            className="ui-canvas-raised flex items-center gap-4 rounded-md bg-card p-3"
            key={i}
          >
            <Skeleton className="h-3 w-3 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="ui-canvas-panel flex flex-col items-center justify-center gap-2 rounded-lg bg-card p-8 text-center">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="font-medium text-sm">{t("routines.loadFailed")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-6">
      <RoutinesSection
        emptyHint={t("routines.list.emptyCustom")}
        locale={locale}
        onEdit={onEditRoutine}
        onSelect={onSelectRoutine}
        routines={customRoutines}
      />
      {systemRoutines.length > 0 ? (
        <RoutinesSection
          locale={locale}
          onSelect={onSelectRoutine}
          routines={systemRoutines}
          title={t("routines.list.system")}
        />
      ) : null}
    </div>
  );
}
