import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import { BUILTIN_TASK_STATUS_DEFINITIONS } from "../../task-status-builtins.js";
import { DispatchStatusStrip } from "../components/operations/dispatch-status-strip.js";
import { OperationsTree } from "../components/operations/operations-tree.js";
import { UnplannedTasksSection } from "../components/operations/unplanned-tasks-section.js";
import { useTasksModuleSecondaryShellNav } from "../hooks/use-tasks-module-secondary-shell-nav.js";
import { cancelTaskAgentRun } from "../lib/task-run-observer-api.js";
import {
  activeGoalsOptions,
  dispatchStatusOptions,
} from "../operations-queries.js";
import { useTaskSettingsQuery } from "../tasks-queries.js";

export function OperationsPage() {
  const { t } = useTranslation("tasks");

  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useTasksModuleSecondaryShellNav();

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("menu.operations") },
    ],
    [moduleRootCrumb, t]
  );

  usePageConfig({
    breadcrumbs,
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
    title: t("operations.title"),
    topbarChrome: "contentBlend",
  });

  const settingsQuery = useTaskSettingsQuery();
  const taskStatusDefinitions =
    settingsQuery.data?.task_status_definitions ??
    BUILTIN_TASK_STATUS_DEFINITIONS;

  const dispatchQuery = useQuery(dispatchStatusOptions());
  const goalsQuery = useQuery(activeGoalsOptions());

  const handleCancelRun = (runId: string) => {
    void cancelTaskAgentRun(runId, {
      reason: "User cancelled from operations cockpit",
    });
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-page">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-xl">{t("operations.title")}</h2>
        <span className="text-muted-foreground text-xs">
          {t("operations.autoRefreshHint")}
        </span>
      </div>

      <DispatchStatusStrip dispatch={dispatchQuery.data} />

      <OperationsTree
        definitions={taskStatusDefinitions}
        goals={goalsQuery.data?.data}
        goalsLoading={goalsQuery.isLoading}
        onCancelRun={handleCancelRun}
      />

      <UnplannedTasksSection
        definitions={taskStatusDefinitions}
        onCancelRun={handleCancelRun}
      />
    </section>
  );
}
