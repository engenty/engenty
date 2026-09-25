import { applyChatStyle } from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyAccessibility,
  applyCustomColors,
  applyFont,
  applyFontSize,
  applySidebarColor,
} from "@/lib/appearance-constants";
import {
  useAppearanceSettingsQuery,
  useSaveAppearanceSettingsMutation,
} from "@/lib/appearance-settings-queries";
import {
  type AppearanceSettings,
  DEFAULT_APPEARANCE,
} from "@/lib/dal/appearance-settings";

export function useAppearanceSettings() {
  const { t, i18n } = useTranslation("common");
  // Read-only: this is the TENANT appearance editor. Light/dark mode is a
  // USER-level preference (see AppearanceBootstrap, which applies the resolved
  // user→tenant→default theme). The tenant editor must NOT call setTheme — doing
  // so clobbers the viewing user's personal theme and races AppearanceBootstrap,
  // which is the dark/light flash loop. We only preview tenant-level visuals
  // (colors, font, sidebar) here.
  const { theme } = useTheme();
  const query = useAppearanceSettingsQuery();
  const saveMutation = useSaveAppearanceSettingsMutation();
  const [settings, setSettings] =
    useState<AppearanceSettings>(DEFAULT_APPEARANCE);
  const initialSyncedRef = useRef(false);

  const lastSaved = query.data ?? DEFAULT_APPEARANCE;
  const loading = query.isLoading && !query.data;

  useEffect(() => {
    if (query.data && !initialSyncedRef.current) {
      setSettings(query.data);
      initialSyncedRef.current = true;
    }
  }, [query.data]);

  const hasChanges = useMemo(
    () =>
      settings.language !== lastSaved.language ||
      settings.themeMode !== lastSaved.themeMode ||
      settings.font !== lastSaved.font ||
      settings.fontSize !== lastSaved.fontSize ||
      settings.sidebarVisibility !== lastSaved.sidebarVisibility ||
      settings.sidebarMode !== lastSaved.sidebarMode ||
      settings.sidebarColor !== lastSaved.sidebarColor ||
      settings.colorPrimary !== lastSaved.colorPrimary ||
      settings.colorSecondary !== lastSaved.colorSecondary ||
      settings.colorBackground !== lastSaved.colorBackground ||
      settings.contrast !== lastSaved.contrast ||
      settings.chatStyle !== lastSaved.chatStyle,
    [settings, lastSaved]
  );

  const applyPreview = useCallback(
    (s: AppearanceSettings) => {
      applyFont(s.font);
      applyFontSize(s.fontSize);
      applyChatStyle(s.chatStyle);
      if (s.language && !i18n.language?.startsWith(s.language)) {
        void i18n.changeLanguage(s.language);
      }
      // Intentionally NOT setTheme(s.themeMode): light/dark is user-owned.
      applySidebarColor(s.sidebarColor);
      applyCustomColors(
        s.colorPrimary,
        s.colorSecondary,
        s.colorBackground,
        s.contrast
      );
      const isHidden = s.sidebarVisibility === "auto-hide";
      localStorage.setItem(
        "engenty:sidebar-hidden",
        isHidden ? "true" : "false"
      );
      window.dispatchEvent(new Event("engenty:sidebar-hidden-change"));
      localStorage.setItem("engenty:sidebar-mode", s.sidebarMode);
      window.dispatchEvent(new Event("engenty:sidebar-mode-change"));
    },
    [i18n]
  );

  const i18nRef = useRef(i18n);
  i18nRef.current = i18n;

  const applyPreviewVisual = useCallback((s: AppearanceSettings) => {
    applyFont(s.font);
    applyFontSize(s.fontSize);
    applyChatStyle(s.chatStyle);
    // Intentionally NOT setTheme(s.themeMode): light/dark is user-owned.
    applySidebarColor(s.sidebarColor);
    applyCustomColors(
      s.colorPrimary,
      s.colorSecondary,
      s.colorBackground,
      s.contrast
    );
    const isHidden = s.sidebarVisibility === "auto-hide";
    localStorage.setItem("engenty:sidebar-hidden", isHidden ? "true" : "false");
    window.dispatchEvent(new Event("engenty:sidebar-hidden-change"));
    localStorage.setItem("engenty:sidebar-mode", s.sidebarMode);
    window.dispatchEvent(new Event("engenty:sidebar-mode-change"));
    if (s.language && !i18nRef.current.language?.startsWith(s.language)) {
      void i18nRef.current.changeLanguage(s.language);
    }
  }, []);

  useEffect(() => {
    applyPreviewVisual(settings);
    const savedContrast =
      (localStorage.getItem("engenty:theme-contrast") as any) === "high"
        ? "high"
        : "normal";
    const savedColorBlind =
      (localStorage.getItem("engenty:theme-colorblind") as any) || "none";
    applyAccessibility(savedContrast, savedColorBlind);
  }, [applyPreviewVisual, settings]);

  const handleResetAll = useCallback(() => {
    setSettings(DEFAULT_APPEARANCE);
    applyPreview(DEFAULT_APPEARANCE);
    const savedContrast =
      (localStorage.getItem("engenty:theme-contrast") as any) === "high"
        ? "high"
        : "normal";
    const savedColorBlind =
      (localStorage.getItem("engenty:theme-colorblind") as any) || "none";
    applyAccessibility(savedContrast, savedColorBlind);
  }, [applyPreview]);

  const handleSave = useCallback(() => {
    saveMutation.mutate(
      { current: settings, lastSaved },
      {
        onSuccess: () => applyPreview(settings),
      }
    );
  }, [settings, lastSaved, applyPreview, saveMutation]);

  const updateSettings = useCallback(
    <K extends keyof AppearanceSettings>(
      key: K,
      value: AppearanceSettings[K]
    ) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const currentLang = i18n.language?.startsWith("de") ? "de" : "en";

  return {
    loading,
    settings,
    lastSaved,
    hasChanges,
    saving: saveMutation.isPending,
    saveError:
      saveMutation.error instanceof Error
        ? saveMutation.error.message
        : saveMutation.error == null
          ? null
          : String(saveMutation.error),
    currentLang,
    resolvedTheme: theme ?? "system",
    handleResetAll,
    handleSave,
    updateSettings,
    t,
  };
}
