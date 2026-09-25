import { applyChatStyle } from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";
import type { ResolvedAppearance } from "@/lib/api/client";
import {
  applyAccessibility,
  applyCustomColors,
  applyFont,
  applyFontSize,
  applySidebarColor,
  syncThemeStyles,
} from "@/lib/appearance-constants";

interface AppearanceBootstrapProps {
  resolvedAppearance: ResolvedAppearance;
}

/** Applies resolved appearance (theme, language, base color, font, font size) on mount. */
export function AppearanceBootstrap({
  resolvedAppearance,
}: AppearanceBootstrapProps) {
  const { setTheme, theme } = useTheme();
  const { i18n } = useTranslation("common");
  const i18nRef = useRef(i18n);
  i18nRef.current = i18n;
  // Current next-themes value, read without re-running the effect. Light/dark is
  // owned by next-themes (the user menu/sections call setTheme, and it syncs
  // across a user's tabs via a `storage` event). We only setTheme here to seed
  // the value on load / when the resolved theme genuinely changes — never
  // re-asserting a value next-themes already holds, which would echo back across
  // tabs and make both windows flash.
  const themeRef = useRef(theme);
  themeRef.current = theme;
  // Whether we've already seeded light/dark from the server on this mount.
  const hasSeededThemeRef = useRef(false);

  useEffect(() => {
    applyFont(resolvedAppearance.font);
    applyFontSize(resolvedAppearance.fontSize);
    applyChatStyle(resolvedAppearance.chatStyle);
    // Seed light/dark from the server's resolved value EXACTLY once, on first
    // load. After that next-themes is the sole owner of the theme; re-asserting
    // the server value on every workspace-context refetch is what made a user's
    // tabs fight each other through next-themes' cross-tab `storage` sync —
    // each correction wrote localStorage, which flipped the other tab, forever.
    if (resolvedAppearance.themeMode && !hasSeededThemeRef.current) {
      hasSeededThemeRef.current = true;
      if (resolvedAppearance.themeMode !== themeRef.current) {
        setTheme(resolvedAppearance.themeMode);
      }
    }

    // Apply sidebar color
    if (resolvedAppearance.sidebarColor) {
      applySidebarColor(resolvedAppearance.sidebarColor);
    }

    // Apply custom colors
    applyCustomColors(
      resolvedAppearance.colorPrimary,
      resolvedAppearance.colorSecondary,
      resolvedAppearance.colorBackground,
      resolvedAppearance.tenantContrast
    );

    // Apply accessibility
    const contrast =
      resolvedAppearance.contrast ||
      ((localStorage.getItem("engenty:theme-contrast") as any) === "high"
        ? "high"
        : "normal");
    const colorBlind =
      resolvedAppearance.colorBlind ||
      (localStorage.getItem("engenty:theme-colorblind") as any) ||
      "none";
    applyAccessibility(contrast as any, colorBlind as any);

    // Apply sidebar visibility
    if (resolvedAppearance.sidebarVisibility) {
      const isHidden = resolvedAppearance.sidebarVisibility === "auto-hide";
      localStorage.setItem(
        "engenty:sidebar-hidden",
        isHidden ? "true" : "false"
      );
      window.dispatchEvent(new Event("engenty:sidebar-hidden-change"));
    }

    // Apply sidebar mode
    if (resolvedAppearance.sidebarMode) {
      localStorage.setItem(
        "engenty:sidebar-mode",
        resolvedAppearance.sidebarMode
      );
      window.dispatchEvent(new Event("engenty:sidebar-mode-change"));
    }

    // Apply layout mode (theme-lines, theme-floating, theme-paper)
    const html = document.documentElement;
    html.classList.remove("theme-lines", "theme-floating", "theme-paper");
    if (resolvedAppearance.layoutMode) {
      html.classList.add(resolvedAppearance.layoutMode);
    } else {
      html.classList.add("theme-lines"); // Default
    }

    // Only switch language when it actually differs — changeLanguage re-renders
    // the whole translated tree, so calling it on every effect run (e.g. each
    // workspace-context refetch) is a major source of the theme-save render storm.
    const targetLang = resolvedAppearance.language;
    if (targetLang && !i18nRef.current.language?.startsWith(targetLang)) {
      void i18nRef.current.changeLanguage(targetLang);
    }

    // Observe theme mode switches (e.g. dynamic light/dark switches)
    const observer = new MutationObserver(() => {
      syncThemeStyles();
    });
    observer.observe(html, {
      attributes: true,
      attributeFilter: ["class"],
    });

    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      // Only write when it actually differs — re-asserting the value next-themes
      // already holds echoes back across tabs via `storage` and flashes both.
      if (customEvent.detail && customEvent.detail !== themeRef.current) {
        setTheme(customEvent.detail);
      }
    };
    window.addEventListener("engenty:theme-change", handleThemeChange);

    return () => {
      observer.disconnect();
      window.removeEventListener("engenty:theme-change", handleThemeChange);
    };
    // Intentionally omit i18n from deps: including it causes the effect to re-run
    // when the user changes language in the menu (i18n reference changes), which
    // would overwrite their choice with stale resolvedAppearance from initial load.
  }, [
    resolvedAppearance.chatStyle,
    resolvedAppearance.font,
    resolvedAppearance.fontSize,
    resolvedAppearance.layoutMode,
    resolvedAppearance.themeMode,
    resolvedAppearance.language,
    resolvedAppearance.sidebarColor,
    resolvedAppearance.sidebarVisibility,
    resolvedAppearance.sidebarMode,
    resolvedAppearance.colorPrimary,
    resolvedAppearance.colorSecondary,
    resolvedAppearance.colorBackground,
    resolvedAppearance.tenantContrast,
    resolvedAppearance.contrast,
    resolvedAppearance.colorBlind,
    setTheme,
  ]);

  return null;
}
