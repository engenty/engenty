import { useCopilotShell } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { DetailPageHeader, uiPageScrollClassName } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { TasksBriefingMode } from "../../src/schema/types.js";
import { BUILTIN_TASK_STATUS_DEFINITIONS } from "../../task-status-builtins.js";
import { BriefingDayColumn } from "../components/briefing/briefing-day-column.js";
import { BriefingHubCards } from "../components/briefing/briefing-hub-cards.js";
import { BriefingInMotion } from "../components/briefing/briefing-in-motion.js";
import { BriefingModeToggle } from "../components/briefing-mode-toggle.js";
import { useTasksBriefingAgentUiSlice } from "../hooks/use-tasks-agent-ui-slice.js";
import { useTasksModuleSecondaryShellNav } from "../hooks/use-tasks-module-secondary-shell-nav.js";
import { useTasksTopbarActions } from "../hooks/use-tasks-topbar-actions.js";
import { isSpaceRootPath } from "../lib/tasks-routes.js";
import { useTasksPaths } from "../lib/use-tasks-paths.js";
import {
  useTaskSettingsQuery,
  useTasksBriefingQuery,
} from "../tasks-queries.js";

export function BriefingPage() {
  const { t, i18n } = useTranslation("tasks");
  const locale = i18n.language || "en";
  const { pathname } = useLocation();
  const tasksPaths = useTasksPaths();
  const { setCopilotContext } = useCopilotShell();
  const [mode, setMode] = useState<TasksBriefingMode>("oversight");
  const isSpaceHome = isSpaceRootPath(pathname);
  const showHubs = !isSpaceHome;
  const { openCreateTask, pageActions, topbarDialogs } =
    useTasksTopbarActions();
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
    contentStackBackground: "paper",
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
    topbarOverlap: true,
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

  const kickerDay = useMemo(() => {
    const now = new Date();
    const weekday = now.toLocaleDateString(locale, { weekday: "long" });
    const time = now.toLocaleTimeString(locale, {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${weekday}, ${time}`;
  }, [locale]);

  const error =
    briefingQuery.error instanceof Error
      ? briefingQuery.error.message
      : briefingQuery.isError
        ? t("briefing.loadFailed")
        : null;

  return (
    <div className={uiPageScrollClassName}>
      <DetailPageHeader
        eyebrow={kickerDay}
        maxWidth="5xl"
        status={
          <BriefingModeToggle
            mode={mode}
            onModeChange={setMode}
            oversightLabel={t("briefing.mode.oversight")}
            personalLabel={t("briefing.mode.personal")}
          />
        }
        title={
          isSpaceHome ? (
            <Link className="hover:text-primary" to={tasksPaths.briefing}>
              {t("briefing.title")}
            </Link>
          ) : (
            t("briefing.title")
          )
        }
        titleClassName="text-2xl leading-8"
        variant="canvas"
      />

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-page">
        {showHubs ? (
          <BriefingHubCards mode={mode} onCreateTask={() => openCreateTask()} />
        ) : null}

        {briefingQuery.isLoading ? (
          <p className="text-muted-foreground text-sm">
            {t("briefing.loading")}
          </p>
        ) : null}
        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        {briefingQuery.isLoading || error || !snapshot ? null : (
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
            <BriefingDayColumn
              locale={locale}
              onCreateTask={() => openCreateTask(null)}
              snapshot={snapshot}
              taskStatusDefinitions={taskStatusDefinitions}
            />
            <BriefingInMotion
              locale={locale}
              snapshot={snapshot}
              taskStatusDefinitions={taskStatusDefinitions}
            />
          </div>
        )}
      </div>

      {topbarDialogs}
    </div>
  );
}
