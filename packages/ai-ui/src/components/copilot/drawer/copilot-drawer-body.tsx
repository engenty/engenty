"use client";

import type { AgUiOpenInterruptMetadata } from "@engenty/ag-ui-bridge";
import { useCopilotShellOrNull } from "@engenty/app-shell";
import { isEngentyDevelopmentEnvironment } from "@engenty/environment";
import { useUiCoreMediaQuery } from "@engenty/ui-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isInterruptResolvedLocally } from "../../../ag-ui/apps-ai/use-engenty-ag-ui-apps-ai-session.js";
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
import { useCopilotVoice } from "../../../copilot/copilot-voice-provider.js";
import { CopilotBrowserPanel } from "../../../features/browser/copilot-browser-panel.js";
import { useMentionAgentCandidates } from "../../../hooks/use-mention-agent-candidates.js";
import { useEngentyThread } from "../../../threads/use-engenty-thread.js";
import type { CopilotCompactContextOption } from "../composer/copilot-compact-context-option";
import { CopilotContextDropdown } from "../composer/copilot-context-dropdown";
import {
  CopilotOpenInterruptBanner,
  hasRenderableOpenInterrupt,
} from "../interrupts/copilot-open-interrupt-banner";
import { pendingInterruptFromTranscript } from "../interrupts/pending-interrupt-from-transcript";
import type { CopilotPanelContentProps } from "../panel/copilot-panel-content";
import { CopilotPanelContent } from "../panel/copilot-panel-content";
import { formatCopilotThreadCopyText } from "../transcript/copilot-thread-copy";
import { TranscriptLoadOlder } from "../transcript/transcript-load-older.js";
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
import { useCopilotDrawerSuggestionsApply } from "./use-copilot-drawer-suggestions-apply";

/** Copilot drawer orchestration (session, layout, panel props). Re-exported as `CopilotDrawer` from `copilot-drawer.tsx`. */
const EMPTY_RESOLVED_IDS: ReadonlySet<string> = new Set();

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
  slashCommands,
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
  agentDebugPayload,
  triggerType = "message_copilot",
  composerLeadingControl: composerLeadingControlProp,
  dockMode: shellDockMode,
  copilotDockRef,
  copilotSidebarRef,
  mainContentRef,
  mainContentReady = false,
  setPreferredDockMode,
  copilotLayout = null,
  preferredDockMode = null,
  copyThreadCopiedLabel = "Copied",
  copyThreadLabel = "Copy thread",
  positionMenuAriaLabel = "Copilot position",
  positionDrawerLabel = "Drawer",
  positionFullscreenLabel = "Full Screen",
  positionHeadingLabel = "Position",
  positionSidebarLabel = "Sidebar",
  positionWindowLabel = "Window",
  agentChooserLabels,
  headerChrome = "default",
  onSandboxCommandInterruptApprove,
  onSandboxCommandInterruptReject,
  openInterruptFromSession,
  injectedSession,
  workPanelContent,
  whoOptions,
}: CopilotDrawerProps) {
  if (!injectedSession) {
    throw new Error(
      'CopilotDrawer requires injectedSession (wire useAgentHost("engenty:copilot") from @engenty/ai-ui).'
    );
  }
  const session = injectedSession;
  const shell = useCopilotShellOrNull();
  const realtimeVoice = useCopilotVoice();
  const river = useCopilotRiver();
  const isMobile = useUiCoreMediaQuery("(max-width: 767px)");
  const talkPathname = copilotContext?.pathname ?? "";
  // The river's own page: the conversation IS the main area there, so the
  // companion has nothing to add and the blob points at the composer instead.
  const onRiverPage = isCopilotRiverPathname(talkPathname);
  const serviceBaseUrl = (serviceBaseUrlProp ?? "").trim().replace(/\/$/, "");

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

  const mentionAgentCandidates = useMentionAgentCandidates();
  const activeThreadId = session.activeThreadId;
  // Same paged query the active provider hydrates from — this only reads the
  // "older page exists" bit and the fetch for the transcript's top control.
  const { olderMessages } = useEngentyThread(ENGENTY_COPILOT_HOST_KEY, {
    threadId: activeThreadId,
  });
  const showCompactLauncher = false;

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

  const handleHeaderClose = useCallback(() => {
    collapseToCompactLauncher();
  }, [collapseToCompactLauncher]);

  const drawerMessages = useMemo(
    () => [...session.messages, ...realtimeVoice.transcriptMessages],
    [session.messages, realtimeVoice.transcriptMessages]
  );
  const threadCopyText = useMemo(
    () => formatCopilotThreadCopyText(drawerMessages),
    [drawerMessages]
  );
  const handleCopyThread = useCallback(async () => {
    if (!threadCopyText) {
      return;
    }
    await navigator.clipboard.writeText(threadCopyText);
  }, [threadCopyText]);

  const positionMenuCopyProps = {
    canCopyThread: threadCopyText.length > 0,
    copyThreadCopiedLabel,
    copyThreadLabel,
    onCopyThread: handleCopyThread,
  } as const;

  const handleSelectFullscreen = useCallback(() => {
    river.navigate?.(copilotRiverPathForPathname(talkPathname));
  }, [river.navigate, talkPathname]);

  const copilotPositionDropdown = setPreferredDockMode ? (
    <CopilotDrawerPositionMenu
      {...positionMenuCopyProps}
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

  // The live stream value wins while set: after an approval, the persisted
  // session metadata still names the PREVIOUS interrupt until the refetch
  // lands, and rendering it re-shows an already-answered card (the "same
  // approval card re-asks" bug with chained/parallel gated tool calls).
  // ...and neither arm may re-show a card this client already answered or
  // dismissed (the session copy lags its refetch).
  const resolvedOpenInterrupt = useMemo(() => {
    const locallyResolved =
      session.resolvedInterruptToolCallIds ?? EMPTY_RESOLVED_IDS;
    for (const candidate of [
      session.openInterruptFromStream,
      openInterruptFromSession,
      session.openInterruptFromSession,
    ]) {
      if (
        candidate &&
        !isInterruptResolvedLocally(candidate, locallyResolved)
      ) {
        return candidate;
      }
    }
    return null;
  }, [
    session.openInterruptFromStream,
    session.openInterruptFromSession,
    session.resolvedInterruptToolCallIds,
    openInterruptFromSession,
  ]);

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

  // The person's browser beside the chat (PLAN-user-browser.md §2.6). The
  // Space comes from the route context the copilot already carries; outside
  // a Space the panel says so rather than hiding the button.
  const [browserPanelOpen, setBrowserPanelOpen] = useState(false);
  const browserSpaceId = readSpaceIdFromRouteContext(
    activeCopilotContext?.scope
  );
  const panelContentProps = {
    browserPanel:
      isFloatingStyle || !browserPanelOpen ? null : (
        <CopilotBrowserPanel spaceId={browserSpaceId} />
      ),
    browserPanelLabel: "Your browser",
    browserPanelOpen: isFloatingStyle ? false : browserPanelOpen,
    // The drawer is the person's own copilot: its every thread is theirs.
    chatKind: isFloatingStyle ? null : ("copilot" as const),
    onToggleBrowserPanel: isFloatingStyle
      ? undefined
      : () => setBrowserPanelOpen((open) => !open),
    contextOptions: compactContextOptions,
    contextMenuLabel: "Context",
    onSelectContext: handleCompactContextChange,
    recentContextMenuLabel: "Recent",
    recentContextOptions: recentCompactContexts,
    selectedContextId: selectedCompactContextId,
    routeStatusLabel:
      compactContextOptions.length > 0
        ? undefined
        : formatCopilotRouteStatusLabel(
            activeCopilotContext?.moduleId ?? module,
            activeCopilotContext?.routeKey ?? routeKey
          ),
    title: title ?? "Enhance",
    // Omitting this left the usage meter mounted but inert (threadId defaults
    // to null) on every panel surface: sidebar, drawer, modal.
    threadId: activeThreadId,
    error: session.error ?? null,
    mentionAgentCandidates,
    messages: drawerMessages,
    transcriptHeader: <TranscriptLoadOlder olderMessages={olderMessages} />,
    pendingUserInsertIndex: session.pendingUserInsertIndex,
    pendingUserParts: session.pendingUserParts,
    pendingUserText: session.pendingUserText,
    status: session.status,
    startMode,
    draft: session.draft,
    setDraft: session.setDraft,
    submitMessage: session.submitMessage,
    composerPlaceholder,
    slashCommands,
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
    dismissInterrupt: session.dismissInterrupt,
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
    triggerType,
    panelMode: panelModeForHeader,
    composerFocusKey: `${session.threadResetKey ?? 0}:${composerFocusToken}`,
    headerChrome,
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
    effectiveMode === "sidebar" ? (
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
  // Gated on renderability: the banner renders null for interrupts it has no
  // card for, and both consumers treat a non-null element as "there is
  // something to show" — which slid the status flap open around nothing.
  const interruptBanner =
    dockInterrupt && hasRenderableOpenInterrupt(dockInterrupt) ? (
      <CopilotOpenInterruptBanner
        onDecisionChoose={(artifactId, choiceId, choiceLabel, interruptId) => {
          session.respond?.(dockInterrupt.tool_call_id, {
            artifactId,
            choiceId,
            choiceLabel,
            interruptId,
          });
        }}
        onDismiss={session.dismissInterrupt}
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

  // No padding wrapper: the composer dock flap (shell `dockContent`) provides
  // the attached card surface and its own padding.
  const dockedInterruptSurface = interruptBanner;

  const copilotLane = (
    <CopilotPanelContent
      key={`panel:${surfaceInstanceKey}`}
      {...panelContentProps}
      bodyOnly={isFloatingStyle}
      centerEmptyLanding={isFloatingStyle ? false : undefined}
      compact={false}
      compactContextControl={sidebarDockContextControl}
      composerDockStyle
      dockedInterruptSurface={dockedInterruptSurface}
      dockedInterruptToolCallId={dockInterrupt?.tool_call_id ?? null}
      enableStatusFlap={false}
      headerVariant={isFloatingStyle ? "floating" : "docked"}
    />
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
      dragHandleLabel="Drag to move"
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
      dragHandleLabel="Drag to move"
      effectiveMode={effectiveMode}
      handleCompactContextChange={handleCompactContextChange}
      injected={session}
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
      panelContentProps={panelContentProps as CopilotPanelContentProps}
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `scope.space_id` of a route context, the same field apps/ai reads. */
function readSpaceIdFromRouteContext(
  scope: Record<string, unknown> | undefined
): string | null {
  const raw = scope?.space_id;
  return typeof raw === "string" && UUID_RE.test(raw.trim())
    ? raw.trim()
    : null;
}
