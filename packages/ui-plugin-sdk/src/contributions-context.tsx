import { createContext, type ReactNode, useContext } from "react";
import type { UiContributions } from "./index.js";

const EMPTY_CONTRIBUTIONS: UiContributions = {
  routes: [],
  adminMenuItems: [],
  backgroundComponents: [],
  chatCommands: [],
  copilotContributions: [],
  dashboardWidgets: [],
  developmentPanels: [],
  i18nNamespaces: [],
  liveBindings: [],
  navigationPrefetch: [],
  settingsItems: [],
  spaceTabs: [],
  tabs: [],
};

interface UiContributionsContextValue {
  contributions: UiContributions;
  /** Whether plugin contributions have finished resolving. */
  ready: boolean;
}

const UiContributionsContext =
  createContext<UiContributionsContextValue | null>(null);

export interface UiContributionsProviderProps {
  children: ReactNode;
  contributions: UiContributions;
  ready?: boolean;
}

/**
 * Bridges the host app's resolved plugin contributions down to plugins that
 * render inside the route tree but cannot reach the host's plugin-resolution
 * internals. Mirrors the host→plugin bridging done by `useWorkspaceContext`.
 */
export function UiContributionsProvider({
  children,
  contributions,
  ready = true,
}: UiContributionsProviderProps) {
  const value: UiContributionsContextValue = { contributions, ready };
  return (
    <UiContributionsContext.Provider value={value}>
      {children}
    </UiContributionsContext.Provider>
  );
}

export function useUiContributions(): UiContributionsContextValue {
  return (
    useContext(UiContributionsContext) ?? {
      contributions: EMPTY_CONTRIBUTIONS,
      ready: false,
    }
  );
}
