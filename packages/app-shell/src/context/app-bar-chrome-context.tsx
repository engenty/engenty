import { createContext, type ReactNode, useContext } from "react";
import type {
  AppBarPosition,
  AppBarTooltipSide,
} from "../types/shell-app-bar-position";

export type AppBarOrientation = "vertical" | "horizontal";

export interface AppBarChromeContextValue {
  /**
   * Labelled 220px rail (left / right only, wide viewports). Tiles that
   * live on the rail — spaces, bell, Copilot — render as rows with a name.
   */
  extended: boolean;
  orientation: AppBarOrientation;
  position: AppBarPosition;
  tooltipSide: AppBarTooltipSide;
}

const DEFAULT_APP_BAR_CHROME: AppBarChromeContextValue = {
  extended: false,
  orientation: "vertical",
  position: "left",
  tooltipSide: "right",
};

const AppBarChromeContext = createContext<AppBarChromeContextValue>(
  DEFAULT_APP_BAR_CHROME
);

export function AppBarChromeProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: AppBarChromeContextValue;
}) {
  return (
    <AppBarChromeContext.Provider value={value}>
      {children}
    </AppBarChromeContext.Provider>
  );
}

export function useAppBarChromeContext(): AppBarChromeContextValue {
  return useContext(AppBarChromeContext);
}
