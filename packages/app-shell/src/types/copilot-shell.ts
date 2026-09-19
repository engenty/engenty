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

/** Context provided by CopilotShellProvider for copilot placement and state. */
export interface CopilotShellContextValue {
  /**
   * True on dedicated full-page chat routes. Hides the drawer/sidebar slot
   * without changing persisted `open`, so leaving the page restores chrome.
   */
  chromeHidden: boolean;
  /** Who the shared conversation chrome is talking to. Not persisted. */
  companionWho: CopilotCompanionWho;
  /** Copilot route context (from pathname or page override). */
  copilotContext: CopilotRouteContext;
  /** True once the desktop app-bar blob mount target is attached. */
  copilotDockReady: boolean;
  /** Ref to the shell-owned app-bar blob slot (personal cluster, outermost). */
  copilotDockRef: MutableRefObject<HTMLDivElement | null>;
  /** Copilot layout load/save (user-settings JSON). */
  copilotLayout: CopilotLayoutPersistence;
  /** True after persisted `copilot.layout` snapshot is applied to shell state. */
  copilotLayoutApplied: boolean;
  /** True once inline sidebar mount target is attached (sidebar dock portal). */
  copilotSidebarReady: boolean;
  /** Ref to the shell-owned inline sidebar container. */
  copilotSidebarRef: MutableRefObject<HTMLDivElement | null>;
  /** Current effective dock mode (screen + preference). */
  dockMode: CopilotDockMode;
  /** True when main content has been mounted (for bottom dock portal). */
  mainContentReady: boolean;
  /** Ref to main content area for bottom dock. */
  mainContentRef: MutableRefObject<HTMLElement | null>;
  /** @internal Notify app-bar blob mount target attached. */
  notifyDockMounted?: () => void;
  /** @internal Notify app-bar blob mount target detached. */
  notifyDockUnmounted?: () => void;
  /** @internal Notify main content mounted. Used by CopilotShellMain. */
  notifyMainMounted?: () => void;
  /** @internal Notify inline sidebar mount target attached. */
  notifySidebarMounted?: () => void;
  /** @internal Notify inline sidebar mount target detached. */
  notifySidebarUnmounted?: () => void;
  /** Whether the copilot panel is open. */
  open: boolean;
  /** User preference; null = auto. */
  preferredDockMode: CopilotDockMode | null;
  /** Switch who the shared chrome is addressed to. */
  setCompanionWho: (who: CopilotCompanionWho) => void;
  /** Override copilot context (e.g. when opening "Enhance" on contact detail). Pass null to reset to pathname-derived. */
  setCopilotContext: (ctx: CopilotContextOverride) => void;
  /** Set open/closed. */
  setOpen: (open: boolean) => void;
  /** Set user preference; null = auto. */
  setPreferredDockMode: (mode: CopilotDockMode | null) => void;
}

/** Props for the copilot slot in AppLayout. */
export interface CopilotSlotProps {
  /** The copilot content to render (e.g. CopilotDrawer). */
  children?: ReactNode;
}
