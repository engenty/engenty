"use client";

// The copilot companion: the river beside the page, as a drawer, a sidebar or
// a window. The lane is the same one every desk draws (`AgentDeskChatPanel`,
// in companion trim); what this body owns is the placement — dock mode,
// window bounds, the blob and its flyout — and the companion's chrome: the
// context switcher, the browser toggle, the position menu, the who chooser
// that swaps the lane for a specialist's (`workPanelContent`).
import { useCopilotShellOrNull } from "@engenty/app-shell";
import { isEngentyDevelopmentEnvironment } from "@engenty/environment";
import { useTranslation } from "@engenty/i18n/ui";
import { useUiCoreMediaQuery } from "@engenty/ui-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ACTIVE_COPILOT_AGENT_ID,
  ENGENTY_COPILOT_HOST_KEY,
} from "../../../agent-provider/host-keys.js";
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
import { useCopilotVoice } from "../../../copilot/copilot-voice-provider.js";
import { AgentDeskChatPanel } from "../../../features/agent-desk/agent-desk-chat-panel.js";
import { DeskMessage } from "../../../features/agent-desk/desk-frame.js";
import { useAgentDeskFeed } from "../../../features/agent-desk/use-agent-desk-feed.js";
import { useAgentDeskThread } from "../../../features/agent-desk/use-agent-desk-thread.js";
import { CopilotBrowserPanel } from "../../../features/browser/copilot-browser-panel.js";
import { useMentionAgentCandidates } from "../../../hooks/use-mention-agent-candidates.js";
import type { CopilotCompactContextOption } from "../composer/copilot-compact-context-option";
import { CopilotContextDropdown } from "../composer/copilot-context-dropdown";
import { CopilotDrawerPositionMenu } from "./copilot-drawer-position-menu";
import { CopilotDrawerSurfaceTree } from "./copilot-drawer-surfaces";
import type {
  CopilotDockMode,
  CopilotDrawerProps,
  CopilotPanelMode,
} from "./copilot-drawer-types";
import {
  buildCompactContextOptions,
  debugCopilotSurface,
  formatCopilotRouteStatusLabel,
  getDockedModePreference,
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
  const { i18n, t } = useTranslation("common");
  const { t: tAi } = useTranslation("ai-ui");
  const locale = i18n.language || "en";
  const shell = useCopilotShellOrNull();
  const realtimeVoice = useCopilotVoice();
  const river = useCopilotRiver();
  const hostKey = ENGENTY_COPILOT_HOST_KEY;
  const deskThread = useAgentDeskThread(hostKey, river.threadId);
  // The copilot's identity — skills, starters, mandate — from the same feed
  // its page reads, so the two never disagree about who is talking.
  const feedQuery = useAgentDeskFeed({
    agentId: ACTIVE_COPILOT_AGENT_ID,
    locale,
    spaceId: null,
  });
  const mentionAgentCandidates = useMentionAgentCandidates();
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
  const compactContextOptions = useMemo(
    () =>
      buildCompactContextOptions({
        copilotContext,
        module,
        routeKey,
        scope,
        title,
      }),
    [copilotContext, module, routeKey, scope, title]
  );
  const [selectedCompactContextId, setSelectedCompactContextId] = useState(
    compactContextOptions[0]?.id ?? "current"
  );
  const [composerFocusToken, setComposerFocusToken] = useState(0);
  const [recentCompactContextIds, setRecentCompactContextIds] = useState<
    string[]
  >([]);
  const selectedCompactContext =
    compactContextOptions.find(
      (contextOption) => contextOption.id === selectedCompactContextId
    ) ?? compactContextOptions[0];
  const activeCopilotContext =
    selectedCompactContext?.routeContext ?? copilotContext;
  const recentCompactContexts = recentCompactContextIds.reduce<
    CopilotCompactContextOption[]
  >((contexts, contextId) => {
    const contextOption = compactContextOptions.find(
      (option) => option.id === contextId
    );
    if (contextOption && contextOption.id !== selectedCompactContext?.id) {
      contexts.push(contextOption);
    }
    return contexts;
  }, []);

  const effectiveMode: CopilotDockMode = shellDockMode ?? "drawer";
  const isFloatingStyle = effectiveMode === "window";
  const [surfaceEpoch, setSurfaceEpoch] = useState(0);
  const previousModeRef = useRef(effectiveMode);

  useEffect(() => {
    if (
      compactContextOptions.some(
        (contextOption) => contextOption.id === selectedCompactContextId
      )
    ) {
      return;
    }
    setSelectedCompactContextId(compactContextOptions[0]?.id ?? "current");
  }, [compactContextOptions, selectedCompactContextId]);

  const handleCompactContextChange = useCallback((contextId: string) => {
    setSelectedCompactContextId(contextId);
    setRecentCompactContextIds((currentIds) =>
      [
        contextId,
        ...currentIds.filter((currentId) => currentId !== contextId),
      ].slice(0, 4)
    );
  }, []);

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
    activeCopilotContext,
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

  // The person's browser beside the chat (PLAN-user-browser.md §2.6): one
  // browser, theirs wherever the copilot is standing.
  const [browserPanelOpen, setBrowserPanelOpen] = useState(false);

  useEffect(() => {
    const previousMode = previousModeRef.current;
    if (previousMode !== effectiveMode) {
      setSurfaceEpoch((currentEpoch) => currentEpoch + 1);
      previousModeRef.current = effectiveMode;
    }
  }, [effectiveMode]);

  const sidebarDockContextControl =
    effectiveMode === "sidebar" ? (
      <CopilotContextDropdown
        contextLabel={t("copilot.context.menu")}
        onSelect={handleCompactContextChange}
        options={compactContextOptions}
        recentLabel={t("copilot.context.recent")}
        recentOptions={recentCompactContexts}
        selectedId={selectedCompactContextId}
        variant="compact"
      />
    ) : undefined;

  const agent = feedQuery.data?.agent;
  const copilotLane = agent ? (
    <AgentDeskChatPanel
      agentConnectors={agent.connectors}
      agentDescription={agent.description}
      agentEngenty={agent.engenty}
      agentId={agent.id}
      agentName={agent.name}
      agentRole={agent.role}
      agentScope={agent.agentScope}
      agentSkills={agent.skills}
      agentStarters={agent.starters}
      companion
      companionChrome={{
        attachLabel,
        bodyOnly: isFloatingStyle,
        browserPanel:
          isFloatingStyle || !browserPanelOpen ? null : <CopilotBrowserPanel />,
        browserPanelLabel: tAi("browser.panel.toggle"),
        browserPanelOpen: isFloatingStyle ? false : browserPanelOpen,
        centerEmptyLanding: isFloatingStyle ? false : undefined,
        // The companion is the person's own copilot: every thread is theirs.
        chatKind: isFloatingStyle ? null : "copilot",
        closeLabel,
        compactContextControl: sidebarDockContextControl,
        contextMenuLabel: t("copilot.context.menu"),
        contextOptions: compactContextOptions,
        detachLabel: t("copilot.position.window"),
        headerChrome,
        headerVariant: isFloatingStyle ? "floating" : "docked",
        onClose: handleHeaderClose,
        onPanelModeChange: handleSurfacePanelModeChange,
        onSelectContext: handleCompactContextChange,
        onToggleBrowserPanel: isFloatingStyle
          ? undefined
          : () => setBrowserPanelOpen((value) => !value),
        panelMode: isFloatingStyle ? "floating" : "docked",
        positionMenu: copilotPositionDropdown,
        recentContextMenuLabel: t("copilot.context.recent"),
        recentContextOptions: recentCompactContexts,
        routeStatusLabel:
          compactContextOptions.length > 0
            ? undefined
            : formatCopilotRouteStatusLabel(
                activeCopilotContext?.moduleId ?? module,
                activeCopilotContext?.routeKey ?? routeKey
              ),
        selectedContextId: selectedCompactContextId,
        title: title ?? t("copilot.title"),
      }}
      composerFocusToken={composerFocusToken}
      composerLeadingControl={composerLeadingControl}
      composerPlaceholder={composerPlaceholder}
      contextPane={false}
      hostKey={hostKey}
      initialMessages={deskThread.initialMessages}
      isLoadingMessages={deskThread.isLoadingMessages}
      key={`panel:${surfaceInstanceKey}`}
      mentionAgentCandidates={mentionAgentCandidates}
      olderMessages={deskThread.olderMessages}
      onSandboxApproved={onSandboxApproved}
      openInterruptFromSession={deskThread.openInterruptFromSession}
      realtimeVoice={realtimeVoice}
      spaceId={null}
      starterPromptsOverride={starterPrompts}
      thread={deskThread.thread.session}
    />
  ) : (
    <DeskMessage>{t("shell.loading")}</DeskMessage>
  );

  const panelContent = workPanelContent ?? copilotLane;

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

  const handleSelectWho = useCallback(
    (id: string) => {
      shell?.setCompanionWho(companionWhoFromOptionId(id));
    },
    [shell]
  );

  const windowTitleBar = isFloatingStyle ? (
    <CopilotWindowTitleBar
      closeLabel={closeLabel}
      dragHandleLabel={t("copilot.dragHandle")}
      onClose={handleHeaderClose}
      positionMenu={copilotPositionDropdown}
      whoChooser={
        whoOptions && whoOptions.length > 0 ? (
          <CopilotWhoChooser
            label={agentChooserLabels?.selectAgent}
            onSelect={handleSelectWho}
            options={whoOptions}
            selectedId={companionWhoOptionId(
              shell?.companionWho ?? { kind: "copilot" }
            )}
          />
        ) : undefined
      }
    />
  ) : undefined;

  return (
    <CopilotDrawerSurfaceTree
      closeLabel={closeLabel}
      compactContextOptions={compactContextOptions}
      composerPlaceholder={composerPlaceholder}
      copilotDockRef={copilotDockRef}
      copilotLayout={copilotLayout}
      copilotPositionDropdown={copilotPositionDropdown}
      copilotSidebarRef={copilotSidebarRef}
      dragHandleLabel={t("copilot.dragHandle")}
      effectiveMode={effectiveMode}
      handleCompactContextChange={handleCompactContextChange}
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
      recentCompactContexts={recentCompactContexts}
      selectedCompactContext={selectedCompactContext}
      selectedCompactContextId={selectedCompactContextId}
      setPreferredDockMode={setPreferredDockMode}
      surfaceInstanceKey={surfaceInstanceKey}
      title={title}
      windowTitleBar={windowTitleBar}
    />
  );
}
