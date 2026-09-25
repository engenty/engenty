import { useSettingsSecondaryShellNav } from "@engenty/app-shell";
import { Button } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { RotateCcw, Save } from "lucide-react";
import { useMemo } from "react";
import {
  AppearanceChatSection,
  AppearanceColorsSection,
  AppearanceFontSection,
  AppearanceFontSizeSection,
  AppearanceLanguageSection,
  AppearanceModeSection,
  AppearanceSidebarSection,
} from "@/components/settings";
import { useAppearanceSettings } from "@/hooks/use-appearance-settings";

export function AppearanceSettingsPage() {
  const {
    loading,
    settings,
    hasChanges,
    saving,
    saveError,
    currentLang,
    resolvedTheme,
    handleResetAll,
    handleSave,
    updateSettings,
    t,
  } = useAppearanceSettings();

  const { moduleRootCrumb, secondaryNavHeaderSlot } =
    useSettingsSecondaryShellNav(t("navigation.settings"));

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("settings.appearanceTitle") },
    ],
    [moduleRootCrumb, t]
  );

  const pageActions = useMemo(
    () => (
      <div className="flex gap-2">
        <Button
          className="h-8 gap-1.5 px-2.5 text-xs"
          disabled={!hasChanges}
          onClick={handleResetAll}
          size="sm"
          variant="outline"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t("settings.resetAll")}
        </Button>
        <Button
          className="h-8 gap-1.5 px-2.5 text-xs"
          disabled={saving || !hasChanges}
          onClick={() => void handleSave()}
          size="sm"
          variant={hasChanges ? "default" : "outline"}
        >
          {saving ? (
            <AnimatedLoaderIcon play="always" size="xs" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {saving ? t("settings.saving") : t("settings.saveSettings")}
        </Button>
      </div>
    ),
    [handleResetAll, handleSave, saving, t, hasChanges]
  );

  usePageConfig({
    breadcrumbs,
    actions: pageActions,
    secondaryNavHeaderSlot,
  });

  if (loading) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-auto">
        <div className="mx-auto w-full max-w-4xl space-y-6 p-page">
          <p className="text-muted-foreground text-sm">
            {t("settings.loading")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-auto">
      <div className="mx-auto w-full max-w-4xl space-y-6 p-page">
        <p className="text-muted-foreground text-sm">
          {t("settings.userPreferencesOverride")}
        </p>
        {saveError && (
          <div
            className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive text-sm"
            role="alert"
          >
            {saveError}
          </div>
        )}

        <AppearanceLanguageSection
          currentLang={currentLang}
          onChange={(code) => updateSettings("language", code)}
          value={settings.language}
        />

        <AppearanceModeSection
          onChange={(id) => updateSettings("themeMode", id)}
          resolvedTheme={resolvedTheme}
          value={settings.themeMode}
        />

        <AppearanceChatSection
          onChange={(style) => updateSettings("chatStyle", style)}
          value={settings.chatStyle}
        />

        <div className="border-t pt-6">
          <p className="mb-6 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
            Experimental
          </p>
          <AppearanceColorsSection
            background={settings.colorBackground}
            contrast={settings.contrast}
            onChangeBackground={(val) => updateSettings("colorBackground", val)}
            onChangeContrast={(val) => updateSettings("contrast", val)}
            onChangePrimary={(val) => updateSettings("colorPrimary", val)}
            onChangeSecondary={(val) => updateSettings("colorSecondary", val)}
            onChangeSidebarColor={(val) => updateSettings("sidebarColor", val)}
            onResetColors={() => {
              updateSettings("colorPrimary", "#e0531b");
              updateSettings("colorSecondary", "#f1f3f5");
              updateSettings("colorBackground", "#faf8f5");
              updateSettings("sidebarColor", "#ffffff");
              updateSettings("contrast", "1.0");
            }}
            primary={settings.colorPrimary}
            secondary={settings.colorSecondary}
            sidebarColor={settings.sidebarColor}
          />
        </div>

        <AppearanceFontSection
          onChange={(id) => updateSettings("font", id)}
          value={settings.font}
        />

        <AppearanceFontSizeSection
          onChange={(id) => updateSettings("fontSize", id)}
          value={settings.fontSize}
        />

        <AppearanceSidebarSection
          mode={settings.sidebarMode}
          onModeChange={(val) => updateSettings("sidebarMode", val)}
          onVisibilityChange={(val) => updateSettings("sidebarVisibility", val)}
          visibility={settings.sidebarVisibility}
        />
      </div>
    </div>
  );
}
