import { useTranslation } from "@engenty/i18n/ui";
import { useQueryClient } from "@engenty/query-client";
import { Button, Input, Label } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getProjectSettings,
  type ProjectSettings as ProjectSettingsType,
  setProjectSettings,
} from "../api.js";
import { TaskStatusesSettingsSection } from "../components/task-statuses-settings-section.js";
import { useProjectsModuleSecondaryShellNav } from "../hooks/use-projects-module-secondary-shell-nav.js";
import { projectKeys } from "../queries.js";

export function ProjectsSettingsPage() {
  const { t } = useTranslation("projects");
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<ProjectSettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProjectSettings()
      .then(setSettings)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load")
      )
      .finally(() => setLoading(false));
  }, []);

  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useProjectsModuleSecondaryShellNav();

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("menu.settings") },
    ],
    [moduleRootCrumb, t]
  );

  const handleSave = useCallback(async () => {
    if (!settings) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await setProjectSettings(settings);
      await queryClient.invalidateQueries({ queryKey: projectKeys.settings() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [queryClient, settings]);

  const pageActions = useMemo(
    () => (
      <Button disabled={saving || !settings} onClick={handleSave} size="sm">
        {t("settings.save")}
      </Button>
    ),
    [handleSave, saving, settings, t]
  );

  usePageConfig({
    breadcrumbs,
    actions: pageActions,
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  if (loading || !settings) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-page pb-10">
        <div className="mx-auto w-full max-w-2xl">
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-page pb-10">
      <div className="mx-auto w-full max-w-2xl space-y-8">
        <div>
          <Label htmlFor="briefing-overdue">
            {t("settings.briefingOverdueDays")}
          </Label>
          <Input
            className="mt-1 max-w-xs"
            id="briefing-overdue"
            max={90}
            min={1}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              setSettings((s) =>
                s
                  ? {
                      ...s,
                      briefing_overdue_days: Number.isFinite(n)
                        ? Math.min(90, Math.max(1, n))
                        : 7,
                    }
                  : s
              );
            }}
            type="number"
            value={settings.briefing_overdue_days}
          />
          <p className="mt-1 text-muted-foreground text-xs">
            {t("settings.briefingOverdueDaysHint")}
          </p>
        </div>

        <TaskStatusesSettingsSection
          onDefinitionsChange={(task_status_definitions) =>
            setSettings((s) =>
              s
                ? {
                    ...s,
                    task_status_definitions,
                    default_task_statuses: task_status_definitions.map(
                      (d) => d.id
                    ),
                  }
                : s
            )
          }
          taskStatusDefinitions={settings.task_status_definitions}
        />

        {error && <p className="text-destructive text-sm">{error}</p>}
      </div>
    </div>
  );
}
