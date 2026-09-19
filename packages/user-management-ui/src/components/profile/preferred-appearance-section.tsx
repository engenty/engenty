import { useTranslation } from "@engenty/i18n/ui";
import { useQuery, useQueryClient } from "@engenty/query-client";
import { Button, SettingsFormSection } from "@engenty/ui-core";
import { Check, Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  usePreferredAppearanceQuery,
  useResetPreferredAppearanceMutation,
  useSavePreferredAppearanceMutation,
} from "../../lib/preferred-appearance-queries.js";
import { getWorkspaceContext } from "../../lib/user-settings-api.js";
import { AppBarPositionField } from "./app-bar-position-field.js";

const LANGUAGES = [
  { code: "en" as const, flag: "🇬🇧", label: "English" },
  { code: "de" as const, flag: "🇩🇪", label: "Deutsch" },
];

const THEME_MODES = [
  { id: "light" as const },
  { id: "dark" as const },
  { id: "system" as const },
] as const;

const FONT_SIZE_OPTIONS = [
  { id: "80", label: "80%" },
  { id: "90", label: "90%" },
  { id: "100", label: "100%" },
  { id: "110", label: "110%" },
  { id: "125", label: "125%" },
] as const;

const CONTRAST_OPTIONS = [
  { id: "normal", label: "Standard" },
  { id: "high", label: "High Contrast" },
] as const;

const COLORBLIND_OPTIONS = [
  { id: "none", label: "None" },
  { id: "deuteranopia", label: "Protanopia / Deuteranopia (Red-Green)" },
  { id: "tritanopia", label: "Tritanopia (Blue-Yellow)" },
] as const;

/**
 * Light/dark is owned exclusively by the host shell's single next-themes
 * provider (storageKey "engenty-ui-theme"). This component ships in a separate
 * bundle whose `useTheme()` may resolve a DIFFERENT next-themes context, so it
 * must never touch the `dark`/`light` html class or localStorage directly —
 * doing so was a second writer that raced next-themes and made both the current
 * and other tabs flash (it even wrote the wrong storage key, "theme"). Instead
 * we signal the shell via this event; the shell's AppearanceBootstrap calls
 * `setTheme`, the one source of truth, which also syncs across tabs on its own.
 */
const notifyThemeChange = (id: string) => {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent("engenty:theme-change", { detail: id }));
};

export interface PreferredAppearanceSectionProps {
  /** When true, changes are deferred until parent calls saveRef.current(). */
  deferSave?: boolean;
  /** Called when dirty state changes (only when deferSave is true). */
  onDirtyChange?: (dirty: boolean) => void;
  /** Ref to assign a save function for deferred persistence. */
  saveRef?: React.MutableRefObject<(() => Promise<void>) | null>;
}

export function PreferredAppearanceSection({
  deferSave = false,
  onDirtyChange,
  saveRef,
}: PreferredAppearanceSectionProps = {}) {
  const { t, i18n } = useTranslation("common");
  const { theme: resolvedTheme } = useTheme();
  const query = usePreferredAppearanceQuery();
  const saveMutation = useSavePreferredAppearanceMutation();
  const resetMutation = useResetPreferredAppearanceMutation();

  const queryClient = useQueryClient();
  const { data: workspaceContext } = useQuery<any>({
    queryKey: ["workspace-context"],
    queryFn: getWorkspaceContext,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const resolvedAppearance = workspaceContext?.resolvedAppearance;

  const loadedLanguage = query.data?.language ?? null;
  const loadedThemeMode = query.data?.themeMode ?? null;
  const loadedFontSize = query.data?.fontSize ?? null;
  const loadedContrast = query.data?.contrast ?? null;
  const loadedColorBlind = query.data?.colorBlind ?? null;

  const [pendingLanguage, setPendingLanguage] = useState<string | null>(null);
  const [pendingThemeMode, setPendingThemeMode] = useState<string | null>(null);
  const [pendingFontSize, setPendingFontSize] = useState<string | null>(null);
  const [pendingContrast, setPendingContrast] = useState<string | null>(null);
  const [pendingColorBlind, setPendingColorBlind] = useState<string | null>(
    null
  );

  const loading = query.isLoading;
  const lastDirtyRef = useRef<boolean | null>(null);
  // Last theme/contrast/colorblind actually applied to the DOM. Guards the apply
  // effect so a workspace-context refetch (which returns a fresh resolvedAppearance
  // object with the SAME values) does not re-dispatch `engenty:theme-change` and
  // re-trigger setTheme → render storm.
  const lastAppliedThemeRef = useRef<string | null>(null);

  const handleReset = useCallback(async () => {
    await resetMutation.mutateAsync();
    setPendingLanguage(null);
    setPendingThemeMode(null);
    setPendingFontSize(null);
    setPendingContrast(null);
    setPendingColorBlind(null);
    if (onDirtyChange) {
      onDirtyChange(false);
    }
  }, [resetMutation, onDirtyChange]);

  const currentLang = (i18n.language?.startsWith("de") ? "de" : "en") as
    | "de"
    | "en";

  const effectiveLang =
    pendingLanguage ??
    loadedLanguage ??
    resolvedAppearance?.language ??
    currentLang;
  const effectiveTheme =
    pendingThemeMode ??
    loadedThemeMode ??
    resolvedAppearance?.themeMode ??
    resolvedTheme ??
    "system";
  const effectiveFontSize =
    pendingFontSize ?? loadedFontSize ?? resolvedAppearance?.fontSize ?? "100";
  const effectiveContrast =
    pendingContrast ??
    loadedContrast ??
    resolvedAppearance?.contrast ??
    "normal";
  const effectiveColorBlind =
    pendingColorBlind ??
    loadedColorBlind ??
    resolvedAppearance?.colorBlind ??
    "none";

  const hasChanges =
    deferSave &&
    ((pendingLanguage != null &&
      String(pendingLanguage) !== String(loadedLanguage ?? "")) ||
      (pendingThemeMode != null &&
        String(pendingThemeMode) !== String(loadedThemeMode ?? "")) ||
      (pendingFontSize != null &&
        String(pendingFontSize) !== String(loadedFontSize ?? "100")) ||
      (pendingContrast != null &&
        String(pendingContrast) !== String(loadedContrast ?? "normal")) ||
      (pendingColorBlind != null &&
        String(pendingColorBlind) !== String(loadedColorBlind ?? "none")));

  useEffect(() => {
    if (deferSave && onDirtyChange && lastDirtyRef.current !== hasChanges) {
      lastDirtyRef.current = hasChanges;
      onDirtyChange(hasChanges);
    }
  }, [deferSave, hasChanges, onDirtyChange]);

  useEffect(() => {
    if (query.data) {
      const activeTheme = query.data.themeMode ?? resolvedAppearance?.themeMode;
      const activeContrast =
        query.data.contrast ?? resolvedAppearance?.contrast ?? "normal";
      const activeColorBlind =
        query.data.colorBlind ?? resolvedAppearance?.colorBlind ?? "none";

      // Only touch the DOM / dispatch when the applied values actually change.
      // Without this, every workspace-context refetch (new object, same values)
      // re-dispatches `engenty:theme-change` → setTheme → re-render storm.
      const signature = `${activeTheme ?? ""}|${activeContrast}|${activeColorBlind}`;
      if (lastAppliedThemeRef.current === signature) {
        return;
      }
      lastAppliedThemeRef.current = signature;

      if (activeTheme) {
        notifyThemeChange(activeTheme);
      }

      localStorage.setItem("engenty:theme-contrast", activeContrast);
      localStorage.setItem("engenty:theme-colorblind", activeColorBlind);

      const html = document.documentElement;
      if (activeContrast === "high") {
        html.classList.add("theme-high-contrast");
        html.style.setProperty("--contrast", "1.4");
      } else {
        html.classList.remove("theme-high-contrast");
        const tenantContrast = html.dataset.tenantContrast || "1.0";
        if (tenantContrast === "1.0") {
          html.style.removeProperty("--contrast");
        } else {
          html.style.setProperty("--contrast", tenantContrast);
        }
      }

      html.classList.remove(
        "theme-protanopia",
        "theme-deuteranopia",
        "theme-tritanopia"
      );
      if (activeColorBlind !== "none") {
        html.classList.add(`theme-${activeColorBlind}`);
      }
    }
  }, [query.data, resolvedAppearance]);

  const persistSave = useCallback(async () => {
    const lang = pendingLanguage ?? loadedLanguage ?? currentLang;
    const theme =
      pendingThemeMode ?? loadedThemeMode ?? resolvedTheme ?? "system";
    const fontSize = pendingFontSize ?? loadedFontSize ?? "100";
    const contrast = pendingContrast ?? loadedContrast ?? "normal";
    const colorBlind = pendingColorBlind ?? loadedColorBlind ?? "none";

    await saveMutation.mutateAsync({
      language: lang,
      themeMode: theme,
      fontSize,
      contrast,
      colorBlind,
    });

    // Pre-stamp the applied signature so the post-save workspace-context refetch
    // (which re-runs the effect above) sees the same values and skips its own
    // notifyThemeChange — otherwise every save dispatches the event twice.
    lastAppliedThemeRef.current = `${theme}|${contrast}|${colorBlind}`;
    notifyThemeChange(theme);

    localStorage.setItem("engenty:theme-contrast", contrast);
    localStorage.setItem("engenty:theme-colorblind", colorBlind);

    setPendingLanguage(null);
    setPendingThemeMode(null);
    setPendingFontSize(null);
    setPendingContrast(null);
    setPendingColorBlind(null);
  }, [
    currentLang,
    loadedLanguage,
    loadedThemeMode,
    loadedFontSize,
    loadedContrast,
    loadedColorBlind,
    pendingLanguage,
    pendingThemeMode,
    pendingFontSize,
    pendingContrast,
    pendingColorBlind,
    resolvedTheme,
    saveMutation,
  ]);

  useEffect(() => {
    if (deferSave && saveRef) {
      saveRef.current = hasChanges ? persistSave : null;
      return () => {
        saveRef.current = null;
      };
    }
  }, [deferSave, hasChanges, persistSave, saveRef]);

  const handleLanguageChange = useCallback(
    (code: string) => {
      void i18n.changeLanguage(code);
      if (deferSave) {
        setPendingLanguage(code);
      } else {
        saveMutation.mutate({
          language: code,
          themeMode:
            pendingThemeMode ?? loadedThemeMode ?? resolvedTheme ?? "system",
          fontSize: pendingFontSize ?? loadedFontSize ?? "100",
          contrast: pendingContrast ?? loadedContrast ?? "normal",
          colorBlind: pendingColorBlind ?? loadedColorBlind ?? "none",
        });
      }
    },
    [
      deferSave,
      i18n,
      loadedThemeMode,
      pendingThemeMode,
      resolvedTheme,
      saveMutation,
      pendingFontSize,
      loadedFontSize,
      pendingContrast,
      loadedContrast,
      pendingColorBlind,
      loadedColorBlind,
      currentLang,
    ]
  );

  const handleThemeChange = useCallback(
    (id: string) => {
      // Signal the host shell's single next-themes provider — the sole owner of
      // the dark/light class + storage (and cross-tab sync). We do NOT call this
      // component's own `setTheme` (a different, provider-less next-themes
      // context here) nor touch the DOM directly; that was the second writer
      // that caused the flashing.
      notifyThemeChange(id);

      if (deferSave) {
        setPendingThemeMode(id);
      } else {
        saveMutation.mutate({
          language: pendingLanguage ?? loadedLanguage ?? currentLang,
          themeMode: id,
          fontSize: pendingFontSize ?? loadedFontSize ?? "100",
          contrast: pendingContrast ?? loadedContrast ?? "normal",
          colorBlind: pendingColorBlind ?? loadedColorBlind ?? "none",
        });
      }
    },
    [
      deferSave,
      loadedLanguage,
      pendingLanguage,
      currentLang,
      saveMutation,
      pendingFontSize,
      loadedFontSize,
      pendingContrast,
      loadedContrast,
      pendingColorBlind,
      loadedColorBlind,
      loadedThemeMode,
    ]
  );

  const handleFontSizeChange = useCallback(
    (sizeId: string) => {
      const scale =
        sizeId === "80"
          ? 0.8
          : sizeId === "90"
            ? 0.9
            : sizeId === "110"
              ? 1.1
              : sizeId === "125"
                ? 1.25
                : 1.0;
      document.documentElement.style.setProperty(
        "--appearance-font-scale",
        String(scale)
      );
      document.documentElement.style.removeProperty("font-size");

      if (deferSave) {
        setPendingFontSize(sizeId);
      } else {
        saveMutation.mutate({
          language: pendingLanguage ?? loadedLanguage ?? currentLang,
          themeMode:
            pendingThemeMode ?? loadedThemeMode ?? resolvedTheme ?? "system",
          fontSize: sizeId,
          contrast: pendingContrast ?? loadedContrast ?? "normal",
          colorBlind: pendingColorBlind ?? loadedColorBlind ?? "none",
        });
      }
    },
    [
      deferSave,
      loadedLanguage,
      pendingLanguage,
      currentLang,
      saveMutation,
      pendingThemeMode,
      loadedThemeMode,
      resolvedTheme,
      pendingContrast,
      loadedContrast,
      pendingColorBlind,
      loadedColorBlind,
      loadedFontSize,
    ]
  );

  const handleContrastChange = useCallback(
    (c: string) => {
      const html = document.documentElement;
      if (c === "high") {
        html.classList.add("theme-high-contrast");
        html.style.setProperty("--contrast", "1.4");
      } else {
        html.classList.remove("theme-high-contrast");
        const tenantContrast = html.dataset.tenantContrast || "1.0";
        if (tenantContrast === "1.0") {
          html.style.removeProperty("--contrast");
        } else {
          html.style.setProperty("--contrast", tenantContrast);
        }
      }

      if (deferSave) {
        setPendingContrast(c);
      } else {
        saveMutation.mutate({
          language: pendingLanguage ?? loadedLanguage ?? currentLang,
          themeMode:
            pendingThemeMode ?? loadedThemeMode ?? resolvedTheme ?? "system",
          fontSize: pendingFontSize ?? loadedFontSize ?? "100",
          contrast: c,
          colorBlind: pendingColorBlind ?? loadedColorBlind ?? "none",
        });
      }
    },
    [
      deferSave,
      loadedLanguage,
      pendingLanguage,
      currentLang,
      saveMutation,
      pendingThemeMode,
      loadedThemeMode,
      resolvedTheme,
      pendingFontSize,
      loadedFontSize,
      pendingColorBlind,
      loadedColorBlind,
      loadedContrast,
    ]
  );

  const handleColorBlindChange = useCallback(
    (cb: string) => {
      const html = document.documentElement;
      html.classList.remove(
        "theme-protanopia",
        "theme-deuteranopia",
        "theme-tritanopia"
      );
      if (cb !== "none") {
        html.classList.add(`theme-${cb}`);
      }

      if (deferSave) {
        setPendingColorBlind(cb);
      } else {
        saveMutation.mutate({
          language: pendingLanguage ?? loadedLanguage ?? currentLang,
          themeMode:
            pendingThemeMode ?? loadedThemeMode ?? resolvedTheme ?? "system",
          fontSize: pendingFontSize ?? loadedFontSize ?? "100",
          contrast: pendingContrast ?? loadedContrast ?? "normal",
          colorBlind: cb,
        });
      }
    },
    [
      deferSave,
      loadedLanguage,
      pendingLanguage,
      currentLang,
      saveMutation,
      pendingThemeMode,
      loadedThemeMode,
      resolvedTheme,
      pendingFontSize,
      loadedFontSize,
      pendingContrast,
      loadedContrast,
      loadedColorBlind,
    ]
  );

  if (loading) {
    return (
      <div className="min-w-0">
        <h2 className="font-medium text-foreground text-lg leading-none">
          {t("settings.preferredAppearance")}
        </h2>
        <p className="mt-1 text-muted-foreground text-sm leading-snug">
          {t("settings.loading")}
        </p>
      </div>
    );
  }

  return (
    <SettingsFormSection
      cardClassName="space-y-6"
      description={t("settings.preferredAppearanceOverride")}
      title={t("settings.preferredAppearance")}
      titleAction={
        <Button
          disabled={resetMutation.isPending || loading}
          onClick={handleReset}
          size="sm"
          variant="outline"
        >
          {resetMutation.isPending ? "Resetting..." : "Reset"}
        </Button>
      }
    >
      {/* Language Section */}
      <div className="space-y-2">
        <h3 className="font-medium text-sm">{t("settings.language")}</h3>
        <div className="flex gap-2">
          {LANGUAGES.map((lang) => (
            <button
              className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 font-medium text-sm transition-colors ${
                effectiveLang === lang.code
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-accent"
              }`}
              key={lang.code}
              onClick={() => handleLanguageChange(lang.code)}
              type="button"
            >
              <span className="text-base">{lang.flag}</span>
              {lang.label}
              {effectiveLang === lang.code && (
                <Check className="ml-1 h-3.5 w-3.5 text-primary" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Theme Mode Section */}
      <div className="space-y-2">
        <h3 className="font-medium text-sm">{t("settings.mode")}</h3>
        <div className="grid grid-cols-3 gap-3">
          {THEME_MODES.map((mode) => {
            const Icon =
              mode.id === "dark" ? Moon : mode.id === "light" ? Sun : Laptop;
            const isActive = effectiveTheme === mode.id;
            return (
              <button
                className={`relative flex flex-col items-center gap-3 rounded-lg border p-4 transition-colors ${
                  isActive
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:bg-accent"
                }`}
                key={mode.id}
                onClick={() => handleThemeChange(mode.id)}
                type="button"
              >
                <div
                  className={`flex h-10 w-full items-end gap-1 rounded-md border p-2 ${
                    mode.id === "dark"
                      ? "border-zinc-700 bg-zinc-900"
                      : mode.id === "light"
                        ? "border-zinc-200 bg-white"
                        : "border-zinc-400 bg-linear-to-r from-white to-zinc-900"
                  }`}
                >
                  <div
                    className={`h-2 w-4 rounded-sm ${
                      mode.id === "dark" ? "bg-zinc-600" : "bg-zinc-300"
                    }`}
                  />
                  <div
                    className={`h-3 w-3 rounded-sm ${
                      mode.id === "dark" ? "bg-zinc-500" : "bg-zinc-200"
                    }`}
                  />
                  <div
                    className={`h-4 w-4 rounded-sm ${
                      mode.id === "dark" ? "bg-zinc-600" : "bg-zinc-300"
                    }`}
                  />
                </div>
                <div className="flex items-center gap-1.5 font-medium text-sm">
                  <Icon className="h-3.5 w-3.5" />
                  {t(`userMenu.${mode.id}_theme`)}
                </div>
                {isActive && (
                  <div className="absolute top-2 right-2">
                    <Check className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <AppBarPositionField />

      {/* Text Size Section */}
      <div className="space-y-2">
        <h3 className="font-medium text-sm">Text Size</h3>
        <div className="flex flex-wrap gap-2">
          {FONT_SIZE_OPTIONS.map((opt) => {
            const isActive = effectiveFontSize === opt.id;
            return (
              <button
                className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 font-medium text-sm transition-colors ${
                  isActive
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-accent"
                }`}
                key={opt.id}
                onClick={() => handleFontSizeChange(opt.id)}
                type="button"
              >
                {opt.label}
                {isActive && (
                  <Check className="ml-1 h-3.5 w-3.5 text-primary" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Accessibility Sub-section */}
      <div className="space-y-4 border-t pt-4">
        <h3 className="font-semibold text-foreground text-xs uppercase tracking-wider">
          Accessibility
        </h3>

        {/* Contrast */}
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Contrast</h4>
          <div className="flex gap-2">
            {CONTRAST_OPTIONS.map((opt) => {
              const isActive = effectiveContrast === opt.id;
              return (
                <button
                  className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 font-medium text-sm transition-colors ${
                    isActive
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-accent"
                  }`}
                  key={opt.id}
                  onClick={() => handleContrastChange(opt.id)}
                  type="button"
                >
                  {opt.label}
                  {isActive && (
                    <Check className="ml-1 h-3.5 w-3.5 text-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Color Blindness */}
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Color Blindness</h4>
          <div className="flex flex-wrap gap-2">
            {COLORBLIND_OPTIONS.map((opt) => {
              const isActive = effectiveColorBlind === opt.id;
              return (
                <button
                  className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 font-medium text-sm transition-colors ${
                    isActive
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-accent"
                  }`}
                  key={opt.id}
                  onClick={() => handleColorBlindChange(opt.id)}
                  type="button"
                >
                  {opt.label}
                  {isActive && (
                    <Check className="ml-1 h-3.5 w-3.5 text-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </SettingsFormSection>
  );
}
