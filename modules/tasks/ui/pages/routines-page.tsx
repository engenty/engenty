// Routines list page — rows navigate to the routed detail page;
// creation stays a dialog (analogous to task/goal creation).
import { type RoutineDto, useRoutinesListQuery } from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { DetailPageHeader, Tabs } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PlanListSubNav } from "../components/plan-list-sub-nav.js";
import { RoutinesCardList } from "../components/routines-card-list.js";
import type {
  RoutinesEnabledFilter,
  RoutinesSortColumn,
} from "../components/routines-display-dialog.js";
import { RoutinesToolbar } from "../components/routines-toolbar.js";
import { useTasksModuleSecondaryShellNav } from "../hooks/use-tasks-module-secondary-shell-nav.js";
import { useTasksTopbarActions } from "../hooks/use-tasks-topbar-actions.js";
import { getRoutinesToolbarLabels } from "../lib/routines-toolbar-labels.js";
import { tasksPaths } from "../lib/tasks-routes.js";
import { usePlanListTabNavigation } from "../lib/use-plan-list-tab-navigation.js";

function compareRoutines(
  a: RoutineDto,
  b: RoutineDto,
  sortBy: RoutinesSortColumn,
  sortOrder: "asc" | "desc"
): number {
  const dir = sortOrder === "asc" ? 1 : -1;
  if (sortBy === "enabled") {
    return (Number(a.enabled) - Number(b.enabled)) * dir;
  }
  if (sortBy === "last_run_at") {
    const aTime = a.last_run_at ? Date.parse(a.last_run_at) : 0;
    const bTime = b.last_run_at ? Date.parse(b.last_run_at) : 0;
    return (aTime - bTime) * dir;
  }
  return a.name.localeCompare(b.name) * dir;
}

export function RoutinesPage() {
  const { t, i18n } = useTranslation("tasks");
  const locale = i18n.language || "en";
  const navigate = useNavigate();
  const onPlanTabChange = usePlanListTabNavigation();
  const { pageActions, topbarDialogs } = useTasksTopbarActions();
  const [search, setSearch] = useState("");
  const [enabledFilter, setEnabledFilter] =
    useState<RoutinesEnabledFilter>("all");
  const [sortBy, setSortBy] = useState<RoutinesSortColumn>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const routinesQuery = useRoutinesListQuery(true);

  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useTasksModuleSecondaryShellNav();

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("tabs.routines") },
    ],
    [moduleRootCrumb, t]
  );

  usePageConfig({
    actions: pageActions,
    breadcrumbs,
    contentStackBackground: "paper",
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
    // Float the transparent topbar over the white header so the two blend.
    topbarOverlap: true,
  });

  const filteredRoutines = useMemo(() => {
    const routines = routinesQuery.data?.routines ?? [];
    const q = search.trim().toLowerCase();
    return routines
      .filter((routine: RoutineDto) => {
        if (enabledFilter === "enabled" && !routine.enabled) {
          return false;
        }
        if (enabledFilter === "disabled" && routine.enabled) {
          return false;
        }
        if (!q) {
          return true;
        }
        return (
          routine.name.toLowerCase().includes(q) ||
          (routine.description?.toLowerCase().includes(q) ?? false) ||
          (routine.agent_id?.toLowerCase().includes(q) ?? false)
        );
      })
      .sort((a, b) => compareRoutines(a, b, sortBy, sortOrder));
  }, [enabledFilter, routinesQuery.data?.routines, search, sortBy, sortOrder]);

  const labels = useMemo(
    () => getRoutinesToolbarLabels(t, filteredRoutines.length),
    [filteredRoutines.length, t]
  );

  const sortOptions = useMemo(
    () =>
      [
        { value: "name" as const, label: labels.sortByName },
        { value: "last_run_at" as const, label: labels.sortByLastRun },
        { value: "enabled" as const, label: labels.sortByEnabled },
      ] as const,
    [labels]
  );

  return (
    <Tabs
      className="flex min-h-0 w-full flex-1 flex-col overflow-hidden"
      onValueChange={onPlanTabChange}
      value="routines"
    >
      <DetailPageHeader
        aboveStrip={<PlanListSubNav />}
        aboveStripAlign="center"
        description={<p>{t("routines.page.description")}</p>}
        maxWidth="5xl"
        title={t("routines.page.title")}
        variant="canvas"
      />

      <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-5xl flex-col px-page pb-10">
          <RoutinesToolbar
            enabledFilter={enabledFilter}
            labels={labels}
            onEnabledFilterChange={setEnabledFilter}
            onSearchChange={setSearch}
            searchQuery={search}
            setSortBy={setSortBy}
            setSortOrder={setSortOrder}
            sortBy={sortBy}
            sortOptions={[...sortOptions]}
            sortOrder={sortOrder}
          />

          <div className="mt-6">
            <RoutinesCardList
              isError={routinesQuery.isError}
              isPending={routinesQuery.isPending}
              locale={locale}
              onEditRoutine={(routine) =>
                navigate(tasksPaths.routineEdit(routine.id))
              }
              onSelectRoutine={(routine) =>
                navigate(tasksPaths.routineDetail(routine.id))
              }
              routines={filteredRoutines}
            />
          </div>
        </div>
      </div>

      {topbarDialogs}
    </Tabs>
  );
}
