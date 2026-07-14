"use client";

import type { AgUiOpenInterruptMetadata } from "@engenty/ag-ui-bridge";
import { isEngentyDevelopmentEnvironment } from "@engenty/environment";
import { useUiCoreMediaQuery } from "@engenty/ui-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCopilotVoice } from "../../../copilot/copilot-voice-provider.js";
import type { CopilotCompactContextOption } from "../composer/copilot-compact-launcher";
import { CopilotContextDropdown } from "../composer/copilot-context-dropdown";
import { CopilotOpenInterruptBanner } from "../interrupts/copilot-open-interrupt-banner";
import { pendingInterruptFromTranscript } from "../interrupts/pending-interrupt-from-transcript";
import type { CopilotPanelContentProps } from "../panel/copilot-panel-content";
import { CopilotPanelContent } from "../panel/copilot-panel-content";
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
} from "./copilot-drawer-utils";
import { useCopilotDrawerAgentChooser } from "./use-copilot-drawer-agent-chooser";
import { useCopilotDrawerLayout } from "./use-copilot-drawer-layout";
import { useCopilotDrawerSuggestionsApply } from "./use-copilot-drawer-suggestions-apply";

/** Copilot drawer orchestration (session, layout, panel props). Re-exported as `CopilotDrawer` from `copilot-drawer.tsx`. */
export function CopilotDrawerBody({
  open,
  onOpenChange,
  module,
  routeKey,
  scope,
  copilotContext,
  serviceBaseUrl: serviceBaseUrlProp,
  getHeaders,
  onApplySuccess,
  onApplySuggestions,
  title,
  starterPrompts,
  startMode = "manual",
  panelMode: controlledPanelMode,
  defaultPanelMode = "docked",
  onPanelModeChange,
  floatingBoundsMargin,
  applySelectedLabel = "Apply selected",
  attachLabel = "Attach",
  artifactLoadFailedLabel = "Failed to load suggestions artifact",
  cancelLabel = "Cancel",
  closeLabel = "Close",
  composerPlaceholder = "Type a message…",
  reviewPromptLabel = "Review the prompt below and click Send to start.",
  selectedCountLabel = "selected",
  suggestedUpdatesLabel = "Suggested updates",
  thinkingLabel = "Thinking ...",
  clearLabel,
  agentDebugPayload,
  triggerType = "message_copilot",
  requestedAgentId,
  composerLeadingControl: composerLeadingControlProp,
  dockMode: shellDockMode,
  copilotSidebarRef,
  mainContentRef,
  mainContentReady = false,
  setPreferredDockMode,
  copilotLayout = null,
  preferredDockMode = null,
  positionMenuAriaLabel = "Copilot position",
  positionBottomLabel = "Bottom dock",
  positionButtonLabel = "Avatar",
  positionDrawerLabel = "Drawer",
  positionFloatingLabel = "Modal",
  positionHeadingLabel = "Position",
  positionSidebarLabel = "Sidebar",
  agentChooserLabels,
  agentSessionChooserEnabled = false,
  chooserMenuAgentId = null,
  chooserMenuSessions = [],
  chooserMenuSessionsLoading = false,
  floatingChatCanonicalMessagesLoading = false,
  floatingChatRouteBinding = false,
  headerChrome = "default",
  onChooserMenuAgentIdChange,
  onSandboxCommandInterruptApprove,
  onSandboxCommandInterruptReject,
  openInterruptFromSession,
  recentSessionsChooser = false,
  registeredAgents = [],
  registeredAgentsLoading = false,
  injectedSession,
}: CopilotDrawerProps) {
  if (!injectedSession) {
    throw new Error(
      'CopilotDrawer requires injectedSession (wire useAgentHost("engenty:copilot") from @engenty/ai-ui).'
    );
  }
  const session = injectedSession;
  const realtimeVoice = useCopilotVoice();
  const isMobile = useUiCoreMediaQuery("(max-width: 767px)");
  const serviceBaseUrl = (serviceBaseUrlProp ?? "").trim().replace(/\/$/, "");
  const appsAiSessionsApi =
    serviceBaseUrl.length > 0 ? `${serviceBaseUrl}/ai/threads` : "";

  const isPanelModeControlled = controlledPanelMode !== undefined;
  const [internalPanelMode, setInternalPanelMode] =
    useState<CopilotPanelMode>(defaultPanelMode);
  const panelMode = isPanelModeControlled
    ? controlledPanelMode
    : internalPanelMode;
  const launcherMode: CopilotDockMode | null =
    shellDockMode ?? (panelMode === "floating" ? "floating" : null);
  const positionMenuValue = useMemo(
    () =>
      normalizeCopilotPositionMenuValue(
        preferredDockMode,
        shellDockMode ?? "floating"
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
  const currentRouteContextOption =
    compactContextOptions.find((option) => option.id === "current") ??
    compactContextOptions[0];
  const activeCopilotContext = agentSessionChooserEnabled
    ? (currentRouteContextOption?.routeContext ?? copilotContext)
    : (selectedCompactContext?.routeContext ?? copilotContext);
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

  const floatingLauncherMode =
    launcherMode === "floating" || launcherMode === "mini-floating";
  const effectiveMode: CopilotDockMode =
    launcherMode === "floating" || launcherMode === "mini-floating"
      ? launcherMode
      : (shellDockMode ?? (panelMode === "floating" ? "floating" : "drawer"));
  const isFloatingStyle =
    effectiveMode === "floating" || effectiveMode === "mini-floating";
  const panelModeForHeader: CopilotPanelMode = isFloatingStyle
    ? "floating"
    : "docked";
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
            ? "floating"
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

  const defaultAgentChooserLabels = useMemo(
    () => ({
      emptySessions: "No sessions yet",
      generalCopilot: "Engenty",
      newSession: "New session",
      selectAgent: "Choose agent",
      sessionsHeading: "Sessions",
    }),
    []
  );
  const agentChooserLabelsEffective =
    agentChooserLabels ?? defaultAgentChooserLabels;

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const activeThreadId = session.activeThreadId;
  const setActiveThreadId = session.setActiveThreadId;
  const threadIdRef = useRef<string | null>(activeThreadId);
  threadIdRef.current = activeThreadId;

  const { handleAgentChooserNewSession, renderAgentSessionChooser } =
    useCopilotDrawerAgentChooser({
      activeThreadId,
      agentChooserLabels: agentChooserLabelsEffective,
      agentSessionChooserEnabled,
      appsAiSessionsApi,
      chooserMenuAgentId,
      chooserMenuSessions,
      chooserMenuSessionsLoading,
      clearDrawerComposerState: session.clearDrawerComposerState,
      floatingChatCanonicalMessagesLoading,
      floatingChatRouteBinding,
      getHeaders,
      onChooserMenuAgentIdChange,
      recentSessionsChooser,
      registeredAgents,
      registeredAgentsLoading,
      selectedAgentId,
      setActiveThreadId,
      setSelectedAgentId,
      threadIdRef,
    });

  const showCompactLauncher =
    floatingLauncherMode ||
    (!open &&
      (effectiveMode === "drawer" ||
        effectiveMode === "bottom" ||
        effectiveMode === "sidebar"));

  const surfaceInstanceKey = `${effectiveMode}:${surfaceEpoch}:${session.activeThreadId}`;

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
    showCompactLauncher,
    surfaceInstanceKey,
  });

  const collapseToCompactLauncher = useCallback(() => {
    layout.collapseToFabIcon();
  }, [layout.collapseToFabIcon]);

  const {
    appliedSuggestions,
    handleApplySuggestions,
    handleCancel,
    shouldHideSuggestionsReview,
  } = useCopilotDrawerSuggestionsApply({
    collapseToCompactLauncher,
    onApplySuccess,
    onApplySuggestions,
    injected: session,
  });

  const handleHeaderNewChat = useCallback(() => {
    if (agentSessionChooserEnabled) {
      const fallback = registeredAgents[0]?.id ?? requestedAgentId ?? null;
      const target = selectedAgentId ?? fallback;
      if (target) {
        handleAgentChooserNewSession(target);
        setComposerFocusToken((token) => token + 1);
        return;
      }
    }
    session.handleNewChat();
    setComposerFocusToken((token) => token + 1);
  }, [
    agentSessionChooserEnabled,
    handleAgentChooserNewSession,
    registeredAgents,
    requestedAgentId,
    selectedAgentId,
    session.handleNewChat,
  ]);

  const handleHeaderClose = useCallback(() => {
    collapseToCompactLauncher();
  }, [collapseToCompactLauncher]);

  const copilotPositionDropdown = setPreferredDockMode ? (
    <CopilotDrawerPositionMenu
      compactTrigger={headerChrome === "contentBlend"}
      onSelectDockPosition={layout.handleDockPositionSelect}
      positionBottomLabel={positionBottomLabel}
      positionButtonLabel={positionButtonLabel}
      positionDrawerLabel={positionDrawerLabel}
      positionFloatingLabel={positionFloatingLabel}
      positionHeadingLabel={positionHeadingLabel}
      positionMenuAriaLabel={positionMenuAriaLabel}
      positionSidebarLabel={positionSidebarLabel}
      showDrawerOption={isMobile}
      value={positionMenuValue}
    />
  ) : null;

  // Bottom dock: drag grip doubles as the position-menu trigger (no 3-dots).
  const bottomDockGripMenu = setPreferredDockMode ? (
    <CopilotDrawerPositionMenu
      gripLabel="Drag to move"
      gripPointerDown={layout.handleBottomDockGripPointerDown}
      onSelectDockPosition={layout.handleDockPositionSelect}
      positionBottomLabel={positionBottomLabel}
      positionButtonLabel={positionButtonLabel}
      positionDrawerLabel={positionDrawerLabel}
      positionFloatingLabel={positionFloatingLabel}
      positionHeadingLabel={positionHeadingLabel}
      positionMenuAriaLabel={positionMenuAriaLabel}
      positionSidebarLabel={positionSidebarLabel}
      showDrawerOption={isMobile}
      value={positionMenuValue}
    />
  ) : null;

  const handleSurfacePanelModeChange =
    effectiveMode === "sidebar" || effectiveMode === "bottom"
      ? (mode: "docked" | "floating") => {
          if (mode === "floating") {
            collapseToCompactLauncher();
            return;
          }
          setPanelMode(mode);
        }
      : (mode: "docked" | "floating") => {
          if (mode === "floating") {
            collapseToCompactLauncher();
            return;
          }
          setPanelMode(mode);
        };

  // The live stream value wins while set: after an approval, the persisted
  // session metadata still names the PREVIOUS interrupt until the refetch
  // lands, and rendering it re-shows an already-answered card (the "same
  // approval card re-asks" bug with chained/parallel gated tool calls).
  const resolvedOpenInterrupt =
    session.openInterruptFromStream ??
    openInterruptFromSession ??
    session.openInterruptFromSession ??
    null;

  const drawerMessages = useMemo(
    () => [...session.messages, ...realtimeVoice.transcriptMessages],
    [session.messages, realtimeVoice.transcriptMessages]
  );

  // The executing decision/feedback chooser to dock above the composer, read from
  // the transcript and gated by the authoritative pending-tool-call set from the
  // stream. Prefer the transcript (no refetch lag for in-band requestDecision/
  // requestFeedback); fall back to the authoritative open interrupt (persisted
  // session metadata / RUN_FINISHED outcome) for server-driven interrupts that never
  // enter the transcript — e.g. the tool-approval gate, which rides
  // `engenty_tool_execute` and is aborted-before-convert.
  const dockInterrupt = useMemo(
    () =>
      (session.pendingInterruptToolCallIds?.size ?? 0) > 0
        ? (pendingInterruptFromTranscript(drawerMessages) ??
          resolvedOpenInterrupt ??
          null)
        : null,
    [session.pendingInterruptToolCallIds, drawerMessages, resolvedOpenInterrupt]
  );

  const panelContentProps = {
    ...(agentSessionChooserEnabled
      ? { agentSessionChooser: renderAgentSessionChooser("panel") }
      : {
          contextOptions: compactContextOptions,
          contextMenuLabel: "Context",
          onSelectContext: handleCompactContextChange,
          recentContextMenuLabel: "Recent",
          recentContextOptions: recentCompactContexts,
          selectedContextId: selectedCompactContextId,
        }),
    routeStatusLabel:
      compactContextOptions.length > 0
        ? undefined
        : formatCopilotRouteStatusLabel(
            activeCopilotContext?.moduleId ?? module,
            activeCopilotContext?.routeKey ?? routeKey
          ),
    title: title ?? "Enhance",
    error: session.error ?? null,
    messages: drawerMessages,
    pendingUserInsertIndex: session.pendingUserInsertIndex,
    pendingUserText: session.pendingUserText,
    status: session.status,
    startMode,
    draft: session.draft,
    setDraft: session.setDraft,
    submitMessage: session.submitMessage,
    composerPlaceholder,
    starterPrompts,
    reviewPromptLabel,
    thinkingLabel,
    composerOverride: realtimeVoice.composerOverride,
    composerLeadingControl:
      composerLeadingControlProp || realtimeVoice.composerLeadingControl ? (
        <div className="flex min-w-0 items-center gap-1">
          {composerLeadingControlProp}
          {realtimeVoice.composerLeadingControl}
        </div>
      ) : undefined,
    debugPayload: undefined,
    agentDebugPayload,
    resumeInterrupt: session.resumeInterrupt,
    awaitingInterrupt: session.awaitingInterrupt,
    openInterrupt: resolvedOpenInterrupt,
    pendingInterruptToolCallIds: session.pendingInterruptToolCallIds,
    optimisticInterruptResults: session.optimisticInterruptResults,
    respond: session.respond,
    onSandboxCommandApprove: (open: AgUiOpenInterruptMetadata) => {
      if (onSandboxCommandInterruptApprove) {
        void onSandboxCommandInterruptApprove(open);
      }
    },
    onSandboxCommandReject: (open: AgUiOpenInterruptMetadata) => {
      if (onSandboxCommandInterruptReject) {
        onSandboxCommandInterruptReject(open);
      } else if (open.tool_name) {
        session.resumeInterrupt?.({
          approved: false,
          interruptId: open.interrupt_id,
          toolName: open.tool_name,
        });
      }
    },
    latestSuggestions: shouldHideSuggestionsReview
      ? []
      : session.latestSuggestions,
    selectedSuggestions: session.selectedSuggestions,
    setSelectedSuggestions: session.setSelectedSuggestions,
    selectedCandidateValues: session.selectedCandidateValues,
    setSelectedCandidateValues: session.setSelectedCandidateValues,
    isApplying: session.isApplying,
    applyError: session.applyError,
    appliedSuggestions,
    artifactError: session.artifactError ?? null,
    applySelectedLabel,
    cancelLabel,
    selectedCountLabel,
    suggestedUpdatesLabel,
    artifactLoadFailedLabel,
    clearLabel,
    triggerType,
    panelMode: panelModeForHeader,
    composerFocusKey: `${session.threadResetKey ?? 0}:${composerFocusToken}`,
    headerChrome,
    onNewChat: handleHeaderNewChat,
    onApplySuggestions: handleApplySuggestions,
    onCancel: handleCancel,
    onStop: session.cancelRun,
    onPanelModeChange: handleSurfacePanelModeChange,
    onClose: handleHeaderClose,
    attachLabel,
    detachLabel: "Detach",
    closeLabel,
    positionMenu: copilotPositionDropdown,
  };

  useEffect(() => {
    const previousMode = previousModeRef.current;
    if (previousMode !== effectiveMode) {
      setSurfaceEpoch((currentEpoch) => currentEpoch + 1);
      previousModeRef.current = effectiveMode;
    }
  }, [effectiveMode]);

  const sidebarDockContextControl =
    effectiveMode === "sidebar" && !agentSessionChooserEnabled ? (
      <CopilotContextDropdown
        contextLabel="Context"
        onSelect={handleCompactContextChange}
        options={compactContextOptions}
        recentLabel="Recent"
        recentOptions={recentCompactContexts}
        selectedId={selectedCompactContextId}
        variant="compact"
      />
    ) : undefined;

  // Pending decision / feedback / approval chooser, rendered above the
  // composer. Built once from the authoritative, gated `dockInterrupt` and
  // reused by BOTH the docked panel (`dockedInterruptSurface`) and the compact
  // surfaces' status flap (`compactInterruptContent` → bottom dock + floating
  // launcher). Sourcing both from the same node is what makes the approval card
  // appear in the bottom dock — the compact surfaces have no transcript of
  // their own to fall back on.
  const interruptBanner = dockInterrupt ? (
    <CopilotOpenInterruptBanner
      onDecisionChoose={(artifactId, choiceId, choiceLabel, interruptId) => {
        session.respond?.(dockInterrupt.tool_call_id, {
          artifactId,
          choiceId,
          choiceLabel,
          interruptId,
        });
      }}
      onFeedbackSubmit={(artifactId, feedback, interruptId) => {
        session.respond?.(dockInterrupt.tool_call_id, {
          artifactId,
          choiceId: "feedback_submit",
          choiceLabel: feedback,
          interruptId,
          payload: { feedback },
        });
      }}
      onSandboxCommandApprove={(open: AgUiOpenInterruptMetadata) => {
        if (onSandboxCommandInterruptApprove) {
          void onSandboxCommandInterruptApprove(open);
        }
      }}
      onSandboxCommandReject={(open: AgUiOpenInterruptMetadata) => {
        if (onSandboxCommandInterruptReject) {
          onSandboxCommandInterruptReject(open);
        } else if (open.tool_name) {
          session.resumeInterrupt?.({
            approved: false,
            interruptId: open.interrupt_id,
            toolName: open.tool_name,
          });
        }
      }}
      open={dockInterrupt}
    />
  ) : null;

  const dockedInterruptSurface = interruptBanner ? (
    <div className="px-3 pb-3">{interruptBanner}</div>
  ) : null;

  const panelContent = (
    <CopilotPanelContent
      key={`panel:${surfaceInstanceKey}`}
      {...panelContentProps}
      compact={open && launcherMode === "mini-floating"}
      compactContextControl={sidebarDockContextControl}
      composerDockStyle={
        effectiveMode === "sidebar" || effectiveMode === "drawer"
      }
      enableStatusFlap={false}
      dockedInterruptSurface={dockedInterruptSurface}
      dockedInterruptToolCallId={dockInterrupt?.tool_call_id ?? null}
      headerVariant={isFloatingStyle ? "floating" : "docked"}
    />
  );

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
      requestedAgentId,
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
    requestedAgentId,
    routeKey,
    scope,
  ]);

  useEffect(() => {
    if (!open || effectiveMode !== "bottom") {
      return;
    }

    const mainContentAnchor = mainContentRef?.current;

    if (!mainContentReady || mainContentAnchor == null) {
      debugCopilotSurface("bottom-dock-missing-anchor", {
        effectiveMode,
        hasMainContentRef: mainContentAnchor != null,
        mainContentReady,
        module,
        routeKey,
      });
    }
  }, [effectiveMode, mainContentReady, mainContentRef, module, open, routeKey]);

  return (
    <CopilotDrawerSurfaceTree
      bottomDockGripMenu={bottomDockGripMenu}
      closeLabel={closeLabel}
      collapseToCompactLauncher={collapseToCompactLauncher}
      compactContextOptions={compactContextOptions}
      compactInterruptContent={interruptBanner}
      composerPlaceholder={composerPlaceholder}
      copilotPositionDropdown={copilotPositionDropdown}
      copilotSidebarRef={copilotSidebarRef}
      dragHandleLabel="Drag to move"
      effectiveMode={effectiveMode}
      handleCompactContextChange={handleCompactContextChange}
      injected={session}
      layout={layout}
      mainContentReady={mainContentReady}
      mainContentRef={mainContentRef}
      onOpenChange={onOpenChange}
      open={open}
      panelContent={panelContent}
      panelContentProps={panelContentProps as CopilotPanelContentProps}
      preferredDockMode={preferredDockMode}
      recentCompactContexts={recentCompactContexts}
      renderCopilotThreadChooser={renderAgentSessionChooser}
      selectedCompactContext={selectedCompactContext}
      selectedCompactContextId={selectedCompactContextId}
      setPreferredDockMode={setPreferredDockMode}
      showCompactLauncher={showCompactLauncher}
      surfaceInstanceKey={surfaceInstanceKey}
      threadChooserEnabled={agentSessionChooserEnabled}
      title={title}
    />
  );
}
