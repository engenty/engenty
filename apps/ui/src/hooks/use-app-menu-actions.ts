import type { AppMenuActions } from "@engenty/app-shell";
import { getSupabaseAuthClient } from "@engenty/auth-ui";
import {
  getDeveloperModePreference,
  isEngentyDevelopmentEnvironment,
  setDeveloperModePreference,
  subscribeDeveloperModePreference,
} from "@engenty/environment";
import { useTranslation } from "@engenty/i18n/ui";
import { useQueryClient } from "@engenty/query-client";
import type { QueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { setUserSetting } from "@/lib/api/client";
import { APPEARANCE_KEYS } from "@/lib/appearance-constants";
import { workspaceContextOptions } from "@/lib/workspace-context-query";

function invalidateWorkspaceAppearance(queryClient: QueryClient) {
  void queryClient.invalidateQueries({
    queryKey: workspaceContextOptions.queryKey,
  });
}

/**
 * Constructs the `AppMenuActions` object for the ⌘K command palette.
 * Mirrors the user-menu behaviour (theme toggle, language switch, dev mode, sign out).
 */
export function useAppMenuActions(): AppMenuActions {
  const queryClient = useQueryClient();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { i18n } = useTranslation("common");
  const navigate = useNavigate();

  const currentLang = i18n.language?.startsWith("de") ? "de" : "en";
  const currentTheme = (resolvedTheme ?? theme ?? "system") as string;

  const showDeveloperMenu = isEngentyDevelopmentEnvironment();
  const [developerMode, setDeveloperMode] = useState(
    getDeveloperModePreference
  );

  useEffect(() => {
    if (!showDeveloperMenu) {
      return;
    }
    return subscribeDeveloperModePreference(() => {
      setDeveloperMode(getDeveloperModePreference());
    });
  }, [showDeveloperMenu]);

  const onToggleTheme = useCallback(() => {
    const next = currentTheme === "dark" ? "light" : "dark";
    setTheme(next);
    void setUserSetting(APPEARANCE_KEYS.themeMode, {
      type: "string",
      value_string: next,
    }).then(() => invalidateWorkspaceAppearance(queryClient));
  }, [currentTheme, setTheme, queryClient]);

  const onToggleLanguage = useCallback(() => {
    const next = currentLang === "de" ? "en" : "de";
    void i18n.changeLanguage(next);
    void setUserSetting(APPEARANCE_KEYS.language, {
      type: "string",
      value_string: next,
    }).then(() => invalidateWorkspaceAppearance(queryClient));
  }, [currentLang, i18n, queryClient]);

  const onToggleDeveloperMode = useCallback(() => {
    const next = !developerMode;
    setDeveloperModePreference(next);
    setDeveloperMode(next);
  }, [developerMode]);

  const onSignOut = useCallback(async () => {
    await getSupabaseAuthClient().auth.signOut();
    navigate("/auth/login");
  }, [navigate]);

  return useMemo(
    () => ({
      currentLang,
      currentTheme,
      developerModeAvailable: showDeveloperMenu,
      developerModeOn: developerMode,
      onSignOut,
      onToggleDeveloperMode,
      onToggleLanguage,
      onToggleTheme,
    }),
    [
      currentLang,
      currentTheme,
      showDeveloperMenu,
      developerMode,
      onSignOut,
      onToggleDeveloperMode,
      onToggleLanguage,
      onToggleTheme,
    ]
  );
}
