import { useSettingsSecondaryShellNav } from "@engenty/app-shell";
import {
  getSupabaseAuthClient,
  initializeWorkspaceAdmin,
} from "@engenty/auth-ui";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Input,
  Label,
  Separator,
  SettingsFormSection,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useMemo, useState } from "react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { config } from "@/lib/config";

export function SettingsPage() {
  const { t } = useTranslation("common");
  const { moduleRootCrumb, secondaryNavHeaderSlot } =
    useSettingsSecondaryShellNav(t("navigation.settings"));
  const [workspaceName, setWorkspaceName] = useState("Engenty");
  const [appLabel, setAppLabel] = useState("Core UI");
  const [setupState, setSetupState] = useState<
    "idle" | "running" | "done" | "error"
  >("idle");
  const [setupMessage, setSetupMessage] = useState<string>("");
  const preview = useMemo(
    () => `${workspaceName} - ${appLabel}`,
    [workspaceName, appLabel]
  );

  const breadcrumbs = useMemo(
    () => (moduleRootCrumb ? [moduleRootCrumb] : []),
    [moduleRootCrumb]
  );

  usePageConfig({
    breadcrumbs,
    secondaryNavHeaderSlot,
  });

  const handleInitializeWorkspace = async () => {
    setSetupState("running");
    setSetupMessage("");
    try {
      await initializeWorkspaceAdmin(getSupabaseAuthClient());
      setSetupState("done");
      setSetupMessage(t("settings.initCompleted"));
    } catch (error) {
      setSetupState("error");
      setSetupMessage(
        error instanceof Error ? error.message : t("settings.initFailed")
      );
    }
  };

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-auto">
      <div className="mx-auto w-full max-w-4xl space-y-6 p-page">
        <SettingsFormSection
          description={t("settings.generalDescription")}
          title={t("settings.generalTitle")}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <Label className="shrink-0 sm:w-40" htmlFor="workspace-name">
              {t("settings.workspaceName")}
            </Label>
            <Input
              className="min-w-0 flex-1"
              id="workspace-name"
              onChange={(event) => setWorkspaceName(event.target.value)}
              value={workspaceName}
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <Label className="shrink-0 sm:w-40" htmlFor="app-label">
              {t("settings.appLabel")}
            </Label>
            <Input
              className="min-w-0 flex-1"
              id="app-label"
              onChange={(event) => setAppLabel(event.target.value)}
              value={appLabel}
            />
          </div>
          <Separator />
          <p className="text-muted-foreground text-sm">
            {t("settings.preview")}: {preview}
          </p>
        </SettingsFormSection>

        <SettingsFormSection
          description={t("settings.workspaceInitDescription")}
          title={t("settings.workspaceInitTitle")}
        >
          <Button
            disabled={setupState === "running"}
            onClick={handleInitializeWorkspace}
          >
            {setupState === "running"
              ? t("settings.initializing")
              : t("settings.initWorkspaceAdmin")}
          </Button>
          {setupMessage ? (
            <p
              className={`text-sm ${setupState === "error" ? "text-destructive" : "text-muted-foreground"}`}
            >
              {setupMessage}
            </p>
          ) : null}
        </SettingsFormSection>

        <SettingsFormSection
          description={t("settings.appearanceDescription")}
          title={t("settings.appearanceTitle")}
        >
          <ThemeSwitcher />
        </SettingsFormSection>

        <SettingsFormSection
          description={t("settings.runtimeDescription")}
          title={t("settings.runtimeTitle")}
        >
          <div className="space-y-2 text-sm">
            <p>
              {t("settings.apiBaseUrl")}:{" "}
              <span className="font-mono">{config.apiBaseUrl}</span>
            </p>
            <p className="text-muted-foreground">{t("settings.envOverride")}</p>
          </div>
        </SettingsFormSection>
      </div>
    </div>
  );
}
