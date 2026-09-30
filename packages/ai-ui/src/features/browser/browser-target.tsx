"use client";

// Which browser a surface shows (PLAN-space-owned-connections.md): a Space's
// browser, and in it one agent's window. The desk provides its agent and its
// Space; the copilot provides the Space it is opened in. Outside every Space
// there is no browser (PLAN-personal-connections.md).
import { createContext, type ReactNode, useContext } from "react";

export interface BrowserTarget {
  /** The agent whose window the live view shows. */
  agentId: string;
  /** Null = no Space, so no browser. */
  spaceId: string | null;
}

const BrowserTargetContext = createContext<BrowserTarget | null>(null);

export function BrowserTargetProvider(props: {
  children: ReactNode;
  value: BrowserTarget;
}) {
  return (
    <BrowserTargetContext.Provider value={props.value}>
      {props.children}
    </BrowserTargetContext.Provider>
  );
}

/** The surrounding desk's browser target; null outside any desk. */
export function useBrowserTarget(): BrowserTarget | null {
  return useContext(BrowserTargetContext);
}
