// Card-list view for routines, sectioned like TasksGroupedList:
// "My routines" (custom, with inline add) and "System" (builtin + module).
import { type RoutineDto, useRoutinesListQuery } from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, Skeleton } from "@engenty/ui-core";
import { AlertCircle, Plus } from "lucide-react";
import { useMemo } from "react";
import { RoutineCard } from "./routine-card.js";

interface RoutinesCardListProps {
  locale: string;
  onAddRoutine?: () => void;
  onEditRoutine?: (routine: RoutineDto) => void;
  onSelectRoutine?: (routine: RoutineDto) => void;
}

function RoutinesSection({
  emptyHint,
  locale,
  onAdd,
  onEdit,
  onSelect,
  routines,
  title,
}: {
  emptyHint?: string;
  locale: string;
  onAdd?: () => void;
  onEdit?: (routine: RoutineDto) => void;
  onSelect?: (routine: RoutineDto) => void;
  routines: RoutineDto[];
  title: string;
}) {
  const { t } = useTranslation("tasks");
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-lg">{title}</h3>
        {onAdd ? (
          <Button
            className="h-auto p-0"
            onClick={onAdd}
            size="sm"
            variant="link"
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("routines.list.addRoutine")}
          </Button>
        ) : null}
      </div>
      {routines.length === 0 ? (
        <p className="text-muted-foreground text-sm">{emptyHint}</p>
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
  locale,
  onAddRoutine,
  onEditRoutine,
  onSelectRoutine,
}: RoutinesCardListProps) {
  const { t } = useTranslation("tasks");
  const { data, isPending, isError } = useRoutinesListQuery(true);

  const { customRoutines, systemRoutines } = useMemo(() => {
    const routines = data?.routines ?? [];
    return {
      customRoutines: routines.filter((r) => r.source === "custom"),
      systemRoutines: routines.filter((r) => r.source !== "custom"),
    };
  }, [data?.routines]);

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
        onAdd={onAddRoutine}
        onEdit={onEditRoutine}
        onSelect={onSelectRoutine}
        routines={customRoutines}
        title={t("routines.list.myRoutines")}
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
