import { useTranslation } from "@engenty/i18n/ui";
import { Button, Input, Label, SettingsFormSection } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TaskSettings } from "../../src/schema/types.js";
import { BUILTIN_TASK_STATUS_DEFINITIONS } from "../../task-status-builtins.js";
import { TaskStatusesSettingsSection } from "../components/task-statuses-settings-section.js";
import { useTasksSettingsAgentUiSlice } from "../hooks/use-tasks-agent-ui-slice.js";
import { useTasksModuleSecondaryShellNav } from "../hooks/use-tasks-module-secondary-shell-nav.js";
import {
  useTaskSettingsQuery,
  useUpdateTaskSettingsMutation,
} from "../tasks-queries.js";

const DEFAULT_SETTINGS: TaskSettings = {
  identifier_prefix: "T-",
  stale_after_days: 14,
  task_status_definitions: BUILTIN_TASK_STATUS_DEFINITIONS.map((d) => ({
    ...d,
  })),
  default_task_statuses: BUILTIN_TASK_STATUS_DEFINITIONS.map((d) => d.id),
};

export function TasksSettingsPage() {
  const { t } = useTranslation("tasks");
  useTasksSettingsAgentUiSlice();
  const query = useTaskSettingsQuery();
  const saveMutation = useUpdateTaskSettingsMutation();
  const initialSyncedRef = useRef(false);
  const [settings, setSettings] = useState<TaskSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (!query.data || initialSyncedRef.current) {
      return;
    }
    initialSyncedRef.current = true;
    setSettings(query.data);
  }, [query.data]);

  const originalSettings = query.data ?? null;
  const loading = query.isLoading;
  const saving = saveMutation.isPending;

  const hasChanges = useMemo(() => {
    if (!originalSettings) {
      return false;
    }
    return JSON.stringify(settings) !== JSON.stringify(originalSettings);
  }, [originalSettings, settings]);

  const saveSettings = useCallback(async () => {
    await saveMutation.mutateAsync({
      identifier_prefix: settings.identifier_prefix,
      stale_after_days: settings.stale_after_days,
      task_status_definitions: settings.task_status_definitions,
    });
  }, [saveMutation, settings]);

  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useTasksModuleSecondaryShellNav();

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("sidebar.settings") },
    ],
    [moduleRootCrumb, t]
  );

  const pageActions = useMemo(
    () => (
      <Button
        className="h-8 gap-1.5 px-2.5 text-xs"
        disabled={saving || loading || !hasChanges}
        onClick={() => void saveSettings()}
        size="sm"
        variant={hasChanges ? "default" : "outline"}
      >
        <Save className="h-3.5 w-3.5" />
        {saving ? t("settings.saving") : t("settings.save")}
      </Button>
    ),
    [hasChanges, loading, saveSettings, saving, t]
  );

  usePageConfig({
    actions: pageActions,
    breadcrumbs,
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
  });

  const error =
    query.error instanceof Error
      ? query.error.message
      : saveMutation.error instanceof Error
        ? saveMutation.error.message
        : null;

  if (loading) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-page pb-10">
        <div className="mx-auto w-full max-w-4xl space-y-6">
          <p className="text-muted-foreground text-sm">
            {t("settings.loading")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-page pb-10">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <SettingsFormSection
          description={t("settings.description")}
          title={t("settings.title")}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <Label
              className="shrink-0 sm:w-48"
              htmlFor="tasks-identifier-prefix"
            >
              {t("settings.identifierPrefix")}
            </Label>
            <Input
              className="min-w-0 flex-1 sm:max-w-xs"
              id="tasks-identifier-prefix"
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  identifier_prefix: e.target.value,
                }))
              }
              value={settings.identifier_prefix}
            />
          </div>
          <p className="text-muted-foreground text-xs">
            {t("settings.identifierPrefixHint")}
          </p>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <Label className="shrink-0 sm:w-48" htmlFor="tasks-stale-days">
              {t("settings.staleAfterDays")}
            </Label>
            <Input
              className="min-w-0 flex-1 sm:max-w-xs"
              id="tasks-stale-days"
              max={90}
              min={1}
              onChange={(e) => {
                const n = Number.parseInt(e.target.value, 10);
                setSettings((prev) => ({
                  ...prev,
                  stale_after_days: Number.isFinite(n)
                    ? Math.min(90, Math.max(1, n))
                    : 14,
                }));
              }}
              type="number"
              value={settings.stale_after_days}
            />
          </div>
          <p className="text-muted-foreground text-xs">
            {t("settings.staleAfterDaysHint")}
          </p>
        </SettingsFormSection>

        <TaskStatusesSettingsSection
          onDefinitionsChange={(task_status_definitions) =>
            setSettings((prev) => ({
              ...prev,
              task_status_definitions,
              default_task_statuses: task_status_definitions.map((d) => d.id),
            }))
          }
          taskStatusDefinitions={settings.task_status_definitions}
        />

        {error ? <p className="text-destructive text-sm">{error}</p> : null}
      </div>
    </div>
  );
}
