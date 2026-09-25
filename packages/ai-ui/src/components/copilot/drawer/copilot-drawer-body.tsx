"use client";

// The copilot companion: the river beside the page, as a drawer, a sidebar or
// a window. The lane is the same one every desk draws (`AgentDeskChatPanel`,
// in companion trim); what this body owns is the placement — dock mode,
// window bounds, the blob and its flyout — and the companion's chrome: the
// browser toggle, the position menu, the who chooser
// that swaps the lane for a hired Engenty (`workPanelContent`).
import {
  useCopilotActionsOrNull,
  useCopilotChromeHidden,
  useCopilotLayoutOrNull,
} from "@engenty/app-shell";
import { isEngentyDevelopmentEnvironment } from "@engenty/environment";
import { useTranslation } from "@engenty/i18n/ui";
import { useUiCoreMediaQuery } from "@engenty/ui-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ENGENTY_COPILOT_HOST_KEY } from "../../../agent-provider/host-keys.js";
import { queueCopilotComposerDraft } from "../../../copilot/copilot-composer-draft-intent.js";
import {
  focusWorkComposer,
  registerWorkComposerFocus,
} from "../../../copilot/copilot-inline-ask.js";
import { useCopilotRiver } from "../../../copilot/copilot-river.js";
import {
  copilotRiverPathForPathname,
  isCopilotRiverPathname,
} from "../../../copilot/copilot-river-paths.js";
import { CopilotApprovalModeMenuSection } from "./copilot-approval-mode-menu";
import { CopilotCompanionLane } from "./copilot-companion-lane";
import { CopilotDeveloperMenuSection } from "./copilot-developer-menu";
import { CopilotDrawerPositionMenu } from "./copilot-drawer-position-menu";
import { CopilotDrawerSurfaceTree } from "./copilot-drawer-surfaces";
import type {
  CopilotDockMode,
  CopilotDrawerProps,
  CopilotPanelMode,
} from "./copilot-drawer-types";
import {
  debugCopilotSurface,
  getDockedModePreference,
  isCopilotCompanionSurfaceActive,
  normalizeCopilotPositionMenuValue,
  openCopilotShell,
} from "./copilot-drawer-utils";
import {
  CopilotWhoChooser,
  companionWhoFromOptionId,
  companionWhoOptionId,
} from "./copilot-who-chooser";
import { CopilotWindowTitleBar } from "./copilot-window-title-bar";
import { useCopilotDrawerLayout } from "./use-copilot-drawer-layout";

export function CopilotDrawerBody({
  open,
  onOpenChange,
  module,
  routeKey,
  scope,
  copilotContext,
  onSandboxApproved,
  title,
  starterPrompts,
  panelMode: controlledPanelMode,
  defaultPanelMode = "docked",
  onPanelModeChange,
  floatingBoundsMargin,
  attachLabel = "Attach",
  closeLabel = "Close",
  composerPlaceholder = "Type a message…",
  composerLeadingControl,
  dockMode: shellDockMode,
  copilotDockRef,
  copilotSidebarRef,
  mainContentRef,
  mainContentReady = false,
  setPreferredDockMode,
  copilotLayout = null,
  preferredDockMode = null,
  positionMenuAriaLabel = "Copilot position",
  positionDrawerLabel = "Drawer",
  positionFullscreenLabel = "Full Screen",
  positionHeadingLabel = "Position",
  positionSidebarLabel = "Sidebar",
  positionWindowLabel = "Window",
  agentChooserLabels,
  headerChrome = "default",
  workPanelContent,
  whoOptions,
}: CopilotDrawerProps) {
  const { t } = useTranslation("common");
  const layoutSlice = useCopilotLayoutOrNull();
  const actions = useCopilotActionsOrNull();
  const chromeHidden = useCopilotChromeHidden();
  const river = useCopilotRiver();
  const isMobile = useUiCoreMediaQuery("(max-width: 767px)");
  const talkPathname = copilotContext?.pathname ?? "";
  // The river's own page: the conversation IS the main area there, so the
  // companion has nothing to add and the blob points at the composer instead.
  const onRiverPage = isCopilotRiverPathname(talkPathname);

  const isPanelModeControlled = controlledPanelMode !== undefined;
  const [internalPanelMode, setInternalPanelMode] =
    useState<CopilotPanelMode>(defaultPanelMode);
  const panelMode = isPanelModeControlled
    ? controlledPanelMode
    : internalPanelMode;
  const launcherMode: CopilotDockMode | null = shellDockMode ?? null;
  const positionMenuValue = useMemo(
    () =>
      normalizeCopilotPositionMenuValue(
        preferredDockMode,
        shellDockMode ?? "sidebar"
      ),
    [preferredDockMode, shellDockMode]
  );
  const [composerFocusToken, setComposerFocusToken] = useState(0);

  const effectiveMode: CopilotDockMode = shellDockMode ?? "drawer";
  const isFloatingStyle = effectiveMode === "window";
  const [surfaceEpoch, setSurfaceEpoch] = useState(0);
  const previousModeRef = useRef(effectiveMode);

  const setPanelMode = useCallback(
    (mode: CopilotPanelMode) => {
      if (!isPanelModeControlled) {
        setInternalPanelMode(mode);
      }
      if (setPreferredDockMode) {
        const nextDockMode =
          mode === "floating"
            ? "window"
            : getDockedModePreference(shellDockMode);
        debugCopilotSurface("panel-mode-change", {
          mode,
          nextDockMode,
          panelMode,
          shellDockMode,
        });
        setPreferredDockMode(nextDockMode);
      }
      onPanelModeChange?.(mode);
    },
    [
      isPanelModeControlled,
      onPanelModeChange,
      panelMode,
      setPreferredDockMode,
      shellDockMode,
    ]
  );

  const surfaceInstanceKey = `${effectiveMode}:${surfaceEpoch}:${river.threadId}`;

  const layout = useCopilotDrawerLayout({
    copilotContext,
    copilotLayout,
    effectiveMode,
    floatingBoundsMargin: floatingBoundsMargin ?? 16,
    headerChrome,
    internalPanelMode,
    isPanelModeControlled,
    isFloatingStyle,
    launcherMode,
    mainContentReady,
    mainContentRef,
    onOpenChange,
    open,
    preferredDockMode,
    routeKey,
    setInternalPanelMode,
    setPanelMode,
    setPreferredDockMode,
    showCompactLauncher: false,
    surfaceInstanceKey,
  });

  const handleHeaderClose = useCallback(() => {
    layout.collapseToFabIcon();
  }, [layout.collapseToFabIcon]);

  const handleSelectFullscreen = useCallback(() => {
    river.navigate?.(copilotRiverPathForPathname(talkPathname));
  }, [river.navigate, talkPathname]);

  const copilotPositionDropdown = setPreferredDockMode ? (
    <CopilotDrawerPositionMenu
      compactTrigger={headerChrome === "contentBlend"}
      extraSection={
        <>
          <CopilotApprovalModeMenuSection />
          <CopilotDeveloperMenuSection />
        </>
      }
      onSelectDockPosition={layout.handleDockPositionSelect}
      onSelectFullscreen={river.navigate ? handleSelectFullscreen : undefined}
      positionDrawerLabel={positionDrawerLabel}
      positionFullscreenLabel={positionFullscreenLabel}
      positionHeadingLabel={positionHeadingLabel}
      positionMenuAriaLabel={positionMenuAriaLabel}
      positionSidebarLabel={positionSidebarLabel}
      positionWindowLabel={positionWindowLabel}
      showDrawerOption={isMobile}
      value={positionMenuValue}
    />
  ) : null;

  const handleSurfacePanelModeChange = (mode: "docked" | "floating") => {
    if (mode === "floating") {
      setPreferredDockMode?.("window");
      onOpenChange(true);
      return;
    }
    setPreferredDockMode?.(getDockedModePreference(shellDockMode));
    onOpenChange(true);
    setPanelMode(mode);
  };

  useEffect(() => {
    const previousMode = previousModeRef.current;
    if (previousMode !== effectiveMode) {
      setSurfaceEpoch((currentEpoch) => currentEpoch + 1);
      previousModeRef.current = effectiveMode;
    }
  }, [effectiveMode]);

  const surfaceActive = isCopilotCompanionSurfaceActive({
    chromeHidden,
    open,
  });
  const handleSelectWho = useCallback(
    (id: string) => {
      actions?.setCompanionWho(companionWhoFromOptionId(id));
    },
    [actions]
  );
  const windowTitleBar = isFloatingStyle ? (
    <CopilotWindowTitleBar
      closeLabel={closeLabel}
      dockToSidebarLabel={positionSidebarLabel}
      dragHandleLabel={t("copilot.dragHandle")}
      onBand={!workPanelContent}
      onClose={handleHeaderClose}
      onDockToSidebar={
        setPreferredDockMode && !isMobile
          ? () => layout.handleDockPositionSelect("sidebar")
          : undefined
      }
      positionMenu={copilotPositionDropdown}
      whoChooser={
        whoOptions && whoOptions.length > 0 ? (
          <CopilotWhoChooser
            label={agentChooserLabels?.selectAgent}
            onSelect={handleSelectWho}
            options={whoOptions}
            selectedId={companionWhoOptionId(
              layoutSlice?.companionWho ?? { kind: "copilot" }
            )}
          />
        ) : undefined
      }
    />
  ) : undefined;
  const panelContent = surfaceActive
    ? (workPanelContent ?? (
        <CopilotCompanionLane
          attachLabel={attachLabel}
          closeLabel={closeLabel}
          composerFocusToken={composerFocusToken}
          composerLeadingControl={composerLeadingControl}
          composerPlaceholder={composerPlaceholder}
          copilotPositionDropdown={copilotPositionDropdown}
          effectiveMode={effectiveMode}
          handleHeaderClose={handleHeaderClose}
          handleSurfacePanelModeChange={handleSurfacePanelModeChange}
          headerChrome={headerChrome}
          headerToolbar={isFloatingStyle ? windowTitleBar : undefined}
          isFloatingStyle={isFloatingStyle}
          onSandboxApproved={onSandboxApproved}
          starterPrompts={starterPrompts}
          surfaceInstanceKey={surfaceInstanceKey}
          title={title}
        />
      ))
    : null;

  useEffect(
    () =>
      registerWorkComposerFocus(() => {
        setComposerFocusToken((token) => token + 1);
      }),
    []
  );

  /**
   * Blob flyout → **Copilot**: the river, where it belongs on this page —
   * the companion beside the page, or on the river's own page nothing to open:
   * the conversation is already the main area, so the composer takes focus.
   */
  const openRiver = useCallback(() => {
    if (onRiverPage) {
      focusWorkComposer();
      return;
    }
    openCopilotShell({
      isMobile,
      isTalkPage: false,
      mergeLayout: copilotLayout?.mergeLayout,
      preferredDockMode,
      setOpen: onOpenChange,
      setPreferredDockMode,
    });
    setComposerFocusToken((token) => token + 1);
  }, [
    copilotLayout?.mergeLayout,
    isMobile,
    onOpenChange,
    onRiverPage,
    preferredDockMode,
    setPreferredDockMode,
  ]);

  /**
   * Blob flyout → **Prompt**: a first line for the river. Queued rather than
   * set, because the composer that should hold it may be one placement away
   * from being mounted.
   */
  const handleSubmitPrompt = useCallback(
    (text: string) => {
      queueCopilotComposerDraft(ENGENTY_COPILOT_HOST_KEY, text);
      openRiver();
      requestAnimationFrame(() => {
        queueCopilotComposerDraft(ENGENTY_COPILOT_HOST_KEY, text);
        focusWorkComposer();
      });
    },
    [openRiver]
  );

  /** Blob click: open or close the river beside the page. */
  const handleFabClick = useCallback(() => {
    if (onRiverPage) {
      focusWorkComposer();
      return;
    }
    layout.handleFabTriggerClick();
  }, [layout.handleFabTriggerClick, onRiverPage]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const m = module || "<empty>";
    const r = routeKey || "<empty>";
    debugCopilotSurface("AI route set", { module: m, routeKey: r });
    if (typeof window !== "undefined" && isEngentyDevelopmentEnvironment()) {
      console.info(`[copilot] AI route set: module=${m} routeKey=${r}`);
    }
  }, [open, module, routeKey]);

  useEffect(() => {
    if (!open) {
      return;
    }
    debugCopilotSurface("surface-open", {
      effectiveMode,
      hasMainContentRef: Boolean(mainContentRef?.current),
      mainContentReady,
      module,
      open,
      panelMode,
      routeKey,
      scope,
    });
  }, [
    effectiveMode,
    mainContentReady,
    mainContentRef,
    module,
    open,
    panelMode,
    routeKey,
    scope,
  ]);

  return (
    <CopilotDrawerSurfaceTree
      closeLabel={closeLabel}
      composerPlaceholder={composerPlaceholder}
      copilotDockRef={copilotDockRef}
      copilotLayout={copilotLayout}
      copilotPositionDropdown={copilotPositionDropdown}
      copilotSidebarRef={copilotSidebarRef}
      dragHandleLabel={t("copilot.dragHandle")}
      effectiveMode={effectiveMode}
      isActive={open || onRiverPage}
      layout={layout}
      mainContentReady={mainContentReady}
      mainContentRef={mainContentRef}
      onFabClick={handleFabClick}
      onOpenChange={onOpenChange}
      onOpenCopilot={openRiver}
      onSubmitPrompt={handleSubmitPrompt}
      open={open}
      panelContent={panelContent}
      preferredDockMode={preferredDockMode}
      setPreferredDockMode={setPreferredDockMode}
      surfaceInstanceKey={surfaceInstanceKey}
      title={title}
      windowTitleBar={workPanelContent ? windowTitleBar : undefined}
    />
  );
}
