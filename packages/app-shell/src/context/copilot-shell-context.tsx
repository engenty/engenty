"use client";

import { cn } from "@engenty/ui-core";
import { deriveCopilotContext } from "@engenty/ui-plugin-sdk";
import {
  type ComponentPropsWithoutRef,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMediaQuery } from "../hooks/use-media-query";
import {
  reconcileCopilotLayoutSnapshot,
  remapPersistedDockMode,
} from "../types/copilot-layout";
import type {
  CopilotCompanionWho,
  CopilotDockMode,
  CopilotLayoutPersistence,
  CopilotRouteContext,
  CopilotShellContextValue,
} from "../types/copilot-shell";
import { AgentUiStateProvider } from "./agent-ui-state-context";

const CopilotShellContext = createContext<CopilotShellContextValue | null>(
  null
);

/** Compute effective dock mode from screen size when user prefers auto. */
function resolveEffectiveMode(
  preferred: CopilotDockMode | null,
  isMobile: boolean,
  isTablet: boolean
): CopilotDockMode {
  const live = remapPersistedDockMode(preferred);
  if (live != null) {
    if (isMobile && live !== "drawer") {
      return "drawer";
    }
    if (isTablet && live === "sidebar") {
      return "drawer";
    }
    return live;
  }
  if (isMobile || isTablet) {
    return "drawer";
  }
  return "sidebar";
}

export function useCopilotShell(): CopilotShellContextValue {
  const ctx = useContext(CopilotShellContext);
  if (!ctx) {
    throw new Error("useCopilotShell must be used within CopilotShellProvider");
  }
  return ctx;
}

export function useCopilotShellOrNull(): CopilotShellContextValue | null {
  return useContext(CopilotShellContext);
}

interface CopilotShellProviderProps {
  children: ReactNode;
  copilotLayout: CopilotLayoutPersistence;
  defaultDockMode?: CopilotDockMode | null;
  /**
   * Hide the floating drawer / inline sidebar slot (full-page chat owns the
   * surface). Does not mutate persisted `open`.
   */
  hideCopilotChrome?: boolean;
  /** Current pathname (from router). Used to derive default copilotContext. */
  pathname?: string;
}

export function CopilotShellProvider({
  children,
  copilotLayout,
  defaultDockMode = null,
  hideCopilotChrome = false,
  pathname = "/",
}: CopilotShellProviderProps) {
  const copilotDockRef = useRef<HTMLDivElement | null>(null);
  const copilotSidebarRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [companionWho, setCompanionWho] = useState<CopilotCompanionWho>({
    kind: "copilot",
  });
  const [preferredDockMode, setPreferredDockMode] =
    useState<CopilotDockMode | null>(() => defaultDockMode ?? null);
  const [override, setOverride] = useState<Partial<CopilotRouteContext> | null>(
    null
  );
  const derived = useMemo(() => deriveCopilotContext(pathname), [pathname]);
  const copilotContext: CopilotRouteContext = useMemo(
    () =>
      override
        ? {
            moduleId: override.moduleId ?? derived.moduleId,
            pathname: override.pathname ?? derived.pathname,
            routeKey: override.routeKey ?? derived.routeKey,
            scope:
              override.scope === null || override.scope === undefined
                ? derived.scope
                : { ...derived.scope, ...override.scope },
          }
        : derived,
    [derived, override]
  );
  const setCopilotContextStable = useCallback(
    (ctx: Partial<CopilotRouteContext> | null) => {
      setOverride(ctx);
    },
    []
  );
  const mainContentRef = useRef<HTMLElement | null>(null);
  const [mainContentReady, setMainContentReady] = useState(false);
  const [copilotDockReady, setCopilotDockReady] = useState(false);
  const [copilotSidebarReady, setCopilotSidebarReady] = useState(false);
  const [copilotLayoutApplied, setCopilotLayoutApplied] = useState(false);

  const isMobile = useMediaQuery("(max-width: 767px)");
  const isTablet = useMediaQuery("(min-width: 768px) and (max-width: 1023px)");

  const dockMode = useMemo(
    () => resolveEffectiveMode(preferredDockMode, isMobile, isTablet),
    [preferredDockMode, isMobile, isTablet]
  );

  const setOpenStable = useCallback((value: boolean) => {
    setOpen(value);
  }, []);

  const setPreferredStable = useCallback((value: CopilotDockMode | null) => {
    setPreferredDockMode(remapPersistedDockMode(value) ?? value);
  }, []);
  const setCompanionWhoStable = useCallback((who: CopilotCompanionWho) => {
    setCompanionWho(who);
  }, []);

  const notifyMainMounted = useCallback(() => {
    setMainContentReady((ready) => (ready ? ready : true));
  }, []);

  const notifyDockMounted = useCallback(() => {
    setCopilotDockReady(true);
  }, []);

  const notifyDockUnmounted = useCallback(() => {
    setCopilotDockReady(false);
  }, []);

  const notifySidebarMounted = useCallback(() => {
    setCopilotSidebarReady(true);
  }, []);

  const notifySidebarUnmounted = useCallback(() => {
    setCopilotSidebarReady(false);
  }, []);

  useEffect(() => {
    if (dockMode !== "sidebar") {
      setCopilotSidebarReady(false);
    }
  }, [dockMode]);

  const shellSnapshotAppliedRef = useRef(false);
  const [shellPersistEnabled, setShellPersistEnabled] = useState(false);

  useLayoutEffect(() => {
    if (!copilotLayout.layoutHydrated || shellSnapshotAppliedRef.current) {
      return;
    }
    shellSnapshotAppliedRef.current = true;
    if (copilotLayout.snapshot) {
      const snapshot = reconcileCopilotLayoutSnapshot(copilotLayout.snapshot);
      setOpen(snapshot.open);
      setPreferredDockMode(
        remapPersistedDockMode(snapshot.preferredDockMode) ??
          defaultDockMode ??
          null
      );
      if (
        copilotLayout.snapshot.open &&
        copilotLayout.snapshot.collapseToCircle
      ) {
        copilotLayout.mergeLayout({ collapseToCircle: false });
      }
    } else {
      setPreferredDockMode(defaultDockMode ?? null);
    }
    setShellPersistEnabled(true);
    setCopilotLayoutApplied(true);
  }, [copilotLayout.layoutHydrated, copilotLayout.snapshot, defaultDockMode]);

  useEffect(() => {
    if (!shellPersistEnabled) {
      return;
    }
    copilotLayout.mergeLayout({ open, preferredDockMode });
  }, [shellPersistEnabled, open, preferredDockMode, copilotLayout.mergeLayout]);

  const value: CopilotShellContextValue = useMemo(
    () => ({
      chromeHidden: hideCopilotChrome,
      companionWho,
      copilotContext,
      copilotLayout,
      copilotDockRef,
      copilotDockReady,
      copilotSidebarRef,
      copilotSidebarReady,
      copilotLayoutApplied,
      open,
      setCopilotContext: setCopilotContextStable,
      setCompanionWho: setCompanionWhoStable,
      setOpen: setOpenStable,
      dockMode,
      preferredDockMode,
      setPreferredDockMode: setPreferredStable,
      mainContentRef,
      mainContentReady,
    }),
    [
      companionWho,
      copilotContext,
      copilotLayout,
      copilotDockReady,
      copilotSidebarReady,
      copilotLayoutApplied,
      hideCopilotChrome,
      open,
      setCompanionWhoStable,
      setCopilotContextStable,
      setOpenStable,
      dockMode,
      preferredDockMode,
      setPreferredStable,
      mainContentReady,
    ]
  );

  const valueWithNotify = useMemo(
    () => ({
      ...value,
      notifyDockMounted,
      notifyDockUnmounted,
      notifyMainMounted,
      notifySidebarMounted,
      notifySidebarUnmounted,
    }),
    [
      value,
      notifyDockMounted,
      notifyDockUnmounted,
      notifyMainMounted,
      notifySidebarMounted,
      notifySidebarUnmounted,
    ]
  );
  const agentUiBase = useMemo(
    () => ({
      route: {
        module_id: copilotContext.moduleId,
        pathname: copilotContext.pathname,
        route_key: copilotContext.routeKey,
      },
      selection: {
        entity_id:
          typeof copilotContext.scope?.entityId === "string"
            ? copilotContext.scope.entityId
            : undefined,
        entity_type:
          typeof copilotContext.scope?.entityType === "string"
            ? copilotContext.scope.entityType
            : typeof copilotContext.scope?.currentModule === "string"
              ? copilotContext.scope.currentModule
              : undefined,
      },
      shell: {
        copilot_open: open,
        dock_mode: dockMode,
      },
    }),
    [copilotContext, dockMode, open]
  );

  return (
    <CopilotShellContext.Provider value={valueWithNotify}>
      <AgentUiStateProvider base={agentUiBase}>{children}</AgentUiStateProvider>
    </CopilotShellContext.Provider>
  );
}

/** Wrapper for main content. Use inside CopilotShellContentArea. */
export function CopilotShellMain({
  className,
  id: _idFromProps,
  ...rest
}: ComponentPropsWithoutRef<"main">) {
  return (
    <main
      className={cn(className)}
      data-engenty-region="main"
      id="engenty-app-main"
      {...rest}
    />
  );
}

/** Wrapper for content area (topbar + main). Assigns mainContentRef for bottom-dock anchoring. */
export function CopilotShellContentArea(
  props: ComponentPropsWithoutRef<"div">
) {
  const ctx = useCopilotShellOrNull();
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const hasNotified = useRef(false);

  const setRef = useCallback((el: HTMLDivElement | null) => {
    const currentCtx = ctxRef.current;
    if (!currentCtx) {
      return;
    }
    currentCtx.mainContentRef.current = el;
    if (el && !hasNotified.current) {
      hasNotified.current = true;
      (currentCtx as { notifyMainMounted?: () => void }).notifyMainMounted?.();
    }
    if (!el) {
      hasNotified.current = false;
    }
  }, []);

  return <div ref={setRef} {...props} />;
}
