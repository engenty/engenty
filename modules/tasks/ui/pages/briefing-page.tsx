import { useCopilotShell } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { DetailPageHeader } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useEffect, useMemo, useState } from "react";
import type { TasksBriefingMode } from "../../src/schema/types.js";
import { BUILTIN_TASK_STATUS_DEFINITIONS } from "../../task-status-builtins.js";
import { BriefingDayColumn } from "../components/briefing/briefing-day-column.js";
import { BriefingHubCards } from "../components/briefing/briefing-hub-cards.js";
import { BriefingInMotion } from "../components/briefing/briefing-in-motion.js";
import { BriefingModeToggle } from "../components/briefing-mode-toggle.js";
import { useTasksBriefingAgentUiSlice } from "../hooks/use-tasks-agent-ui-slice.js";
import { useTasksModuleSecondaryShellNav } from "../hooks/use-tasks-module-secondary-shell-nav.js";
import { useTasksTopbarActions } from "../hooks/use-tasks-topbar-actions.js";
import {
  useTaskSettingsQuery,
  useTasksBriefingQuery,
} from "../tasks-queries.js";

export function BriefingPage() {
  const { t, i18n } = useTranslation("tasks");
  const locale = i18n.language || "en";
  const { setCopilotContext } = useCopilotShell();
  const [mode, setMode] = useState<TasksBriefingMode>("oversight");
  const {
    openCreateGoal,
    openCreateRoutine,
    openCreateTask,
    pageActions,
    topbarDialogs,
  } = useTasksTopbarActions();
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
    topbarChrome: "contentBlend",
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

  const weekday = useMemo(
    () =>
      new Date().toLocaleDateString(locale, {
        weekday: "long",
      }),
    [locale]
  );

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
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
      <DetailPageHeader
        description={<p>{subtitle}</p>}
        eyebrow={t("briefing.kicker", { day: weekday })}
        maxWidth="5xl"
        status={
          <BriefingModeToggle
            mode={mode}
            onModeChange={setMode}
            oversightLabel={t("briefing.mode.oversight")}
            personalLabel={t("briefing.mode.personal")}
          />
        }
        title={t("briefing.title")}
        variant="canvas"
      />

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-page pb-10">
        <BriefingHubCards
          mode={mode}
          onCreateGoal={openCreateGoal}
          onCreateRoutine={openCreateRoutine}
          onCreateTask={() => openCreateTask(null)}
        />

        {briefingQuery.isLoading ? (
          <p className="text-muted-foreground text-sm">
            {t("briefing.loading")}
          </p>
        ) : null}
        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        {briefingQuery.isLoading || error || !snapshot ? null : (
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
            <BriefingDayColumn
              locale={locale}
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
