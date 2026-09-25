"use client";

import { createContext, type ReactNode, useContext, useMemo } from "react";

export interface CopilotPathValue {
  chromeHidden: boolean;
  pathname: string;
}

export const COPILOT_PATH_FALLBACK: CopilotPathValue = {
  chromeHidden: false,
  pathname: "/",
};

const CopilotPathnameContext = createContext(COPILOT_PATH_FALLBACK.pathname);
const CopilotChromeHiddenContext = createContext(
  COPILOT_PATH_FALLBACK.chromeHidden
);

/**
 * Path of the page, provided UNDER the shell. The shell provider itself does
 * not subscribe to the router, so a space switch does not re-render copilot,
 * AI, or live-sync. Callers subscribe to pathname or chromeHidden separately.
 */
export function CopilotPathProvider({
  children,
  chromeHidden,
  pathname,
}: {
  children: ReactNode;
  chromeHidden: boolean;
  pathname: string;
}) {
  return (
    <CopilotPathnameContext.Provider value={pathname}>
      <CopilotChromeHiddenContext.Provider value={chromeHidden}>
        {children}
      </CopilotChromeHiddenContext.Provider>
    </CopilotPathnameContext.Provider>
  );
}

export function useCopilotPathname(): string {
  return useContext(CopilotPathnameContext);
}

export function useCopilotChromeHidden(): boolean {
  return useContext(CopilotChromeHiddenContext);
}

export function useCopilotPath(): CopilotPathValue {
  const chromeHidden = useCopilotChromeHidden();
  const pathname = useCopilotPathname();
  return useMemo(() => ({ chromeHidden, pathname }), [chromeHidden, pathname]);
}
