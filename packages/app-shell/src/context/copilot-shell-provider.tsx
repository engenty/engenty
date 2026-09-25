"use client";

import {
  type ReactNode,
  useCallback,
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
  CopilotShellActionsValue,
  CopilotShellHostValue,
  CopilotShellLayoutValue,
} from "../types/copilot-shell";
import { AgentUiStateProvider } from "./agent-ui-state-context";
import { mergeCopilotRoute, resolveEffectiveMode } from "./copilot-shell-merge";
import {
  CopilotActionsContext,
  CopilotHostContext,
  CopilotLayoutContext,
  CopilotOverrideContext,
} from "./copilot-shell-slices";

interface CopilotShellProviderProps {
  children: ReactNode;
  copilotLayout: CopilotLayoutPersistence;
  defaultDockMode?: CopilotDockMode | null;
}

export function CopilotShellProvider({
  children,
  copilotLayout,
  defaultDockMode = null,
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
      // First run — nothing stored for this person yet: open the copilot as
      // the window beside its blob, where its welcome waits. From here on
      // the stored layout decides.
      setOpen(true);
      setPreferredDockMode(defaultDockMode ?? "window");
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

  const layoutValue = useMemo(
    (): CopilotShellLayoutValue => ({
      companionWho,
      copilotLayoutApplied,
      dockMode,
      open,
      preferredDockMode,
    }),
    [companionWho, copilotLayoutApplied, dockMode, open, preferredDockMode]
  );

  const actionsValue = useMemo(
    (): CopilotShellActionsValue => ({
      notifyDockMounted,
      notifyDockUnmounted,
      notifyMainMounted,
      notifySidebarMounted,
      notifySidebarUnmounted,
      setCompanionWho: setCompanionWhoStable,
      setCopilotContext: setCopilotContextStable,
      setOpen: setOpenStable,
      setPreferredDockMode: setPreferredStable,
    }),
    [
      notifyDockMounted,
      notifyDockUnmounted,
      notifyMainMounted,
      notifySidebarMounted,
      notifySidebarUnmounted,
      setCompanionWhoStable,
      setCopilotContextStable,
      setOpenStable,
      setPreferredStable,
    ]
  );

  const hostValue = useMemo(
    (): CopilotShellHostValue => ({
      copilotDockReady,
      copilotDockRef,
      copilotLayout,
      copilotSidebarReady,
      copilotSidebarRef,
      mainContentReady,
      mainContentRef,
    }),
    [copilotDockReady, copilotLayout, copilotSidebarReady, mainContentReady]
  );

  const copilotContext = useMemo(
    () => mergeCopilotRoute("/", override),
    [override]
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
    <CopilotLayoutContext.Provider value={layoutValue}>
      <CopilotActionsContext.Provider value={actionsValue}>
        <CopilotHostContext.Provider value={hostValue}>
          <CopilotOverrideContext.Provider value={override}>
            <AgentUiStateProvider base={agentUiBase}>
              {children}
            </AgentUiStateProvider>
          </CopilotOverrideContext.Provider>
        </CopilotHostContext.Provider>
      </CopilotActionsContext.Provider>
    </CopilotLayoutContext.Provider>
  );
}
