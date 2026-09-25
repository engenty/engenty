import type { MutableRefObject, ReactNode } from "react";
import type {
  CopilotDockMode,
  CopilotLayoutPersistenceApi,
} from "./copilot-layout.js";

export type { CopilotDockMode } from "./copilot-layout.js";

/** User-settings–backed copilot layout persistence (injected by host app). */
export type CopilotLayoutPersistence = CopilotLayoutPersistenceApi;

/** Use on hosts without copilot persistence (e.g. manage app). */
export const COPILOT_LAYOUT_NOOP: CopilotLayoutPersistence = {
  snapshot: null,
  layoutHydrated: true,
  mergeLayout: () => {},
};

/** Copilot route context (moduleId, routeKey, scope). */
export interface CopilotRouteContext {
  moduleId: string;
  pathname: string;
  routeKey: string;
  scope?: Record<string, unknown>;
}

/** Partial override for copilot context (e.g. when opening "Enhance" on contact detail). */
export type CopilotContextOverride = Partial<CopilotRouteContext> | null;

/** Who the Work / Window / Talk chrome is currently addressed to. */
export type CopilotCompanionWho =
  | { kind: "copilot" }
  | { kind: "engenty"; agentId: string };

/** Open/dock/who — independent of the live route. */
export interface CopilotShellLayoutValue {
  companionWho: CopilotCompanionWho;
  copilotLayoutApplied: boolean;
  dockMode: CopilotDockMode;
  open: boolean;
  preferredDockMode: CopilotDockMode | null;
}

/** Stable setters. Identity does not change on space switch. */
export interface CopilotShellActionsValue {
  notifyDockMounted?: () => void;
  notifyDockUnmounted?: () => void;
  notifyMainMounted?: () => void;
  notifySidebarMounted?: () => void;
  notifySidebarUnmounted?: () => void;
  setCompanionWho: (who: CopilotCompanionWho) => void;
  setCopilotContext: (ctx: CopilotContextOverride) => void;
  setOpen: (open: boolean) => void;
  setPreferredDockMode: (mode: CopilotDockMode | null) => void;
}

/** Mount targets and persistence — not the live path. */
export interface CopilotShellHostValue {
  copilotDockReady: boolean;
  copilotDockRef: MutableRefObject<HTMLDivElement | null>;
  copilotLayout: CopilotLayoutPersistence;
  copilotSidebarReady: boolean;
  copilotSidebarRef: MutableRefObject<HTMLDivElement | null>;
  mainContentReady: boolean;
  mainContentRef: MutableRefObject<HTMLElement | null>;
}

/** Composed shell value. Prefer slice hooks so a space switch does not fan out. */
export interface CopilotShellContextValue
  extends CopilotShellActionsValue,
    CopilotShellHostValue,
    CopilotShellLayoutValue {
  /**
   * True on dedicated full-page chat routes. Hides the drawer/sidebar slot
   * without changing persisted `open`, so leaving the page restores chrome.
   */
  chromeHidden: boolean;
  /** Copilot route context (from pathname or page override). */
  copilotContext: CopilotRouteContext;
}

/** Props for the copilot slot in AppLayout. */
export interface CopilotSlotProps {
  /** The copilot content to render (e.g. CopilotDrawer). */
  children?: ReactNode;
}
