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
import type {
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
  if (preferred != null) {
    if (isMobile && preferred !== "drawer") {
      return "drawer";
    }
    if (isTablet && (preferred === "sidebar" || preferred === "bottom")) {
      return "drawer";
    }
    return preferred;
  }
  if (isMobile) {
    return "drawer";
  }
  if (isTablet) {
    return "drawer";
  }
  return "floating";
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
  /** Current pathname (from router). Used to derive default copilotContext. */
  pathname?: string;
}

export function CopilotShellProvider({
  children,
  copilotLayout,
  defaultDockMode = null,
  pathname = "/",
}: CopilotShellProviderProps) {
  const copilotSidebarRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
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
    setPreferredDockMode(value);
  }, []);

  const notifyMainMounted = useCallback(() => {
    setMainContentReady((ready) => (ready ? ready : true));
  }, []);

  const shellSnapshotAppliedRef = useRef(false);
  const [shellPersistEnabled, setShellPersistEnabled] = useState(false);

  useLayoutEffect(() => {
    if (!copilotLayout.layoutHydrated || shellSnapshotAppliedRef.current) {
      return;
    }
    shellSnapshotAppliedRef.current = true;
    if (copilotLayout.snapshot) {
      setOpen(copilotLayout.snapshot.open);
      setPreferredDockMode(
        (copilotLayout.snapshot.preferredDockMode as CopilotDockMode | null) ??
          defaultDockMode ??
          null
      );
    } else {
      setPreferredDockMode(defaultDockMode ?? null);
    }
    setShellPersistEnabled(true);
  }, [copilotLayout.layoutHydrated, copilotLayout.snapshot, defaultDockMode]);

  useEffect(() => {
    if (!shellPersistEnabled) {
      return;
    }
    copilotLayout.mergeLayout({ open, preferredDockMode });
  }, [shellPersistEnabled, open, preferredDockMode, copilotLayout.mergeLayout]);

  const value: CopilotShellContextValue = useMemo(
    () => ({
      copilotContext,
      copilotLayout,
      copilotSidebarRef,
      open,
      setCopilotContext: setCopilotContextStable,
      setOpen: setOpenStable,
      dockMode,
      preferredDockMode,
      setPreferredDockMode: setPreferredStable,
      mainContentRef,
      mainContentReady,
    }),
    [
      copilotContext,
      copilotLayout,
      open,
      setCopilotContextStable,
      setOpenStable,
      dockMode,
      preferredDockMode,
      setPreferredStable,
      mainContentReady,
    ]
  );

  const valueWithNotify = useMemo(
    () => ({ ...value, notifyMainMounted }),
    [value, notifyMainMounted]
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
  return <main className={cn(className)} id="engenty-app-main" {...rest} />;
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
