import { useCopilotShell } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { TasksBriefingMode } from "../../src/schema/types.js";
import { BUILTIN_TASK_STATUS_DEFINITIONS } from "../../task-status-builtins.js";
import {
  BriefingOverviewDashboard,
  BriefingPersonalDashboard,
} from "../components/briefing/briefing-dashboard.js";
import { BriefingModeToggle } from "../components/briefing-mode-toggle.js";
import { BriefingInboxSection } from "../components/inbox/briefing-inbox-section.js";
import { useTasksBriefingAgentUiSlice } from "../hooks/use-tasks-agent-ui-slice.js";
import { useTasksModuleSecondaryShellNav } from "../hooks/use-tasks-module-secondary-shell-nav.js";
import { useTasksTopbarActions } from "../hooks/use-tasks-topbar-actions.js";
import { tasksPaths } from "../lib/tasks-routes.js";
import {
  useTaskSettingsQuery,
  useTasksBriefingQuery,
} from "../tasks-queries.js";

export function BriefingPage() {
  const { t } = useTranslation("tasks");
  const { setCopilotContext } = useCopilotShell();
  const [mode, setMode] = useState<TasksBriefingMode>("oversight");
  const { pageActions, topbarDialogs } = useTasksTopbarActions();
  const settingsQuery = useTaskSettingsQuery();
  const briefingQuery = useTasksBriefingQuery(mode);

  const taskStatusDefinitions =
    settingsQuery.data?.task_status_definitions ??
    BUILTIN_TASK_STATUS_DEFINITIONS;

  const snapshot = briefingQuery.data;

  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useTasksModuleSecondaryShellNav();

  const breadcrumbs = useMemo(
    () => (moduleRootCrumb ? [moduleRootCrumb] : []),
    [moduleRootCrumb]
  );

  usePageConfig({
    actions: pageActions,
    breadcrumbs,
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  useTasksBriefingAgentUiSlice({ mode, snapshot: snapshot ?? null });

  useEffect(() => {
    setCopilotContext({
      routeKey: "briefing",
      scope: {
        briefing_view: mode,
        current_module: "tasks",
        currentModule: "tasks",
        routeKey: "briefing",
      },
    });
    return () => setCopilotContext(null);
  }, [mode, setCopilotContext]);

  const reasonLabel = (reason: string) => t(`briefing.reason.${reason}`);

  const subtitle =
    mode === "oversight"
      ? t("briefing.subtitleOversight")
      : t("briefing.subtitlePersonal");

  const error =
    briefingQuery.error instanceof Error
      ? briefingQuery.error.message
      : briefingQuery.isError
        ? t("briefing.loadFailed")
        : null;

  return (
    <section className="flex min-h-0 w-full flex-1 flex-col gap-6 overflow-auto p-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-semibold text-xl">{t("briefing.title")}</h1>
          <p className="text-muted-foreground text-sm">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BriefingModeToggle
            mode={mode}
            onModeChange={setMode}
            oversightLabel={t("briefing.mode.oversight")}
            personalLabel={t("briefing.mode.personal")}
          />
          <Button asChild size="sm" variant="outline">
            <Link to={tasksPaths.list}>{t("briefing.viewAllTasks")}</Link>
          </Button>
        </div>
      </div>

      {briefingQuery.isLoading ? (
        <p className="text-muted-foreground text-sm">{t("briefing.loading")}</p>
      ) : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <BriefingInboxSection />

      {briefingQuery.isLoading || error || !snapshot ? null : mode ===
        "oversight" ? (
        <BriefingOverviewDashboard
          snapshot={snapshot}
          taskStatusDefinitions={taskStatusDefinitions}
        />
      ) : (
        <BriefingPersonalDashboard
          reasonLabel={reasonLabel}
          snapshot={snapshot}
          taskStatusDefinitions={taskStatusDefinitions}
        />
      )}
      {topbarDialogs}
    </section>
  );
}
