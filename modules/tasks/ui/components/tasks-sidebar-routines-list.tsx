// Routines tab body for the tasks secondary sidebar — respects sidebar
// list-settings prefs (group / sort / enabled filter).
import { useRoutinesListQuery } from "@engenty/ai-ui/embed";
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
import {
  organizeSidebarRoutines,
  type SidebarRoutineItem,
  type TasksSidebarRoutinesPrefs,
} from "../lib/tasks-sidebar-organization.js";

function RoutineSidebarRow({
  active,
  routine,
}: {
  active: boolean;
  routine: SidebarRoutineItem;
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
  prefs,
}: {
  activeRoutineId: string | null;
  prefs: TasksSidebarRoutinesPrefs;
}) {
  const { t } = useTranslation("tasks");
  const routinesQuery = useRoutinesListQuery();

  const groups = useMemo(() => {
    const routines = routinesQuery.data?.routines ?? [];
    return organizeSidebarRoutines({
      labels: {
        custom: t("routines.list.myRoutines"),
        disabled: t("routines.list.disabled"),
        enabled: t("routines.list.enabled"),
        system: t("routines.list.system"),
      },
      prefs,
      routines,
    });
  }, [prefs, routinesQuery.data?.routines, t]);

  if (routinesQuery.isPending) {
    return <SidebarEntitySkeleton />;
  }

  const totalCount = groups.reduce((sum, group) => sum + group.items.length, 0);
  if (totalCount === 0) {
    return (
      <p className="pl-2 text-muted-foreground text-xs">
        {t("sidebar.noRoutines")}
      </p>
    );
  }

  return (
    <SidebarNavList>
      {groups.map((group) => (
        <div className="contents" key={group.id}>
          {group.label ? (
            <SidebarNavSectionLabel>
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate">{group.label}</span>
                <span className="shrink-0 text-muted-foreground">
                  {t("sidebar.groupCount", { count: group.count })}
                </span>
              </span>
            </SidebarNavSectionLabel>
          ) : null}
          {group.items.map((routine) => (
            <RoutineSidebarRow
              active={activeRoutineId === routine.id}
              key={routine.id}
              routine={routine}
            />
          ))}
        </div>
      ))}
    </SidebarNavList>
  );
}
