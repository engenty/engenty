// Routines tab body for the tasks secondary sidebar — lists custom + system
// routines the same way the main routines page sections them.
import { type RoutineDto, useRoutinesListQuery } from "@engenty/ai-ui/embed";
import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  cn,
  SidebarNavList,
  SidebarNavSectionLabel,
  SidebarRow,
  SidebarRowButton,
  Skeleton,
} from "@engenty/ui-core";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { tasksPaths } from "../lib/tasks-routes.js";

function RoutineSidebarRow({
  active,
  routine,
}: {
  active: boolean;
  routine: RoutineDto;
}) {
  const { t } = useTranslation("tasks");
  const statusLabel = t(
    routine.enabled ? "routines.list.enabled" : "routines.list.disabled"
  );

  return (
    <SidebarRow isActive={active}>
      <SidebarRowButton asChild isActive={active}>
        <Link
          to={tasksPaths.routineDetail(routine.id)}
          {...shellSecondaryNavItemProps}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span
              aria-hidden
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                routine.enabled ? "bg-emerald-500" : "bg-muted-foreground/40"
              )}
              title={statusLabel}
            />
            <span className="min-w-0 flex-1 truncate">{routine.name}</span>
          </span>
        </Link>
      </SidebarRowButton>
    </SidebarRow>
  );
}

function SidebarEntitySkeleton() {
  return (
    <div className="flex flex-col gap-1.5 pl-2">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton className="h-6 w-full" key={`rtn-${i}`} />
      ))}
    </div>
  );
}

export function TasksSidebarRoutinesList({
  activeRoutineId,
}: {
  activeRoutineId: string | null;
}) {
  const { t } = useTranslation("tasks");
  const routinesQuery = useRoutinesListQuery();

  const { customRoutines, systemRoutines } = useMemo(() => {
    const routines = routinesQuery.data?.routines ?? [];
    return {
      customRoutines: routines.filter((r: RoutineDto) => r.source === "custom"),
      systemRoutines: routines.filter((r: RoutineDto) => r.source !== "custom"),
    };
  }, [routinesQuery.data?.routines]);

  if (routinesQuery.isPending) {
    return <SidebarEntitySkeleton />;
  }

  if (customRoutines.length === 0 && systemRoutines.length === 0) {
    return (
      <p className="pl-2 text-muted-foreground text-xs">
        {t("sidebar.noRoutines")}
      </p>
    );
  }

  return (
    <SidebarNavList>
      {customRoutines.length > 0 ? (
        <div className="contents">
          <SidebarNavSectionLabel>
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{t("routines.list.myRoutines")}</span>
              <span className="shrink-0 text-muted-foreground">
                {t("sidebar.groupCount", { count: customRoutines.length })}
              </span>
            </span>
          </SidebarNavSectionLabel>
          {customRoutines.map((routine) => (
            <RoutineSidebarRow
              active={activeRoutineId === routine.id}
              key={routine.id}
              routine={routine}
            />
          ))}
        </div>
      ) : null}
      {systemRoutines.length > 0 ? (
        <div className="contents">
          <SidebarNavSectionLabel>
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{t("routines.list.system")}</span>
              <span className="shrink-0 text-muted-foreground">
                {t("sidebar.groupCount", { count: systemRoutines.length })}
              </span>
            </span>
          </SidebarNavSectionLabel>
          {systemRoutines.map((routine) => (
            <RoutineSidebarRow
              active={activeRoutineId === routine.id}
              key={routine.id}
              routine={routine}
            />
          ))}
        </div>
      ) : null}
    </SidebarNavList>
  );
}
