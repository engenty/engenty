"use client";

import {
  cn,
  SidePanel,
  SidePanelContent,
  SidePanelDescription,
  SidePanelTitle,
  useBlobCharacterCycle,
} from "@engenty/ui-core";
import type { ReactNode, RefObject } from "react";
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useCopilotVoice } from "../../../copilot/copilot-voice-provider.js";
import { PromptInputProvider } from "../../ai-elements/prompt-input";
import { CopilotCompactComposerShell } from "../composer/copilot-compact-composer-shell";
import {
  type CopilotCompactContextOption,
  CopilotCompactLauncher,
} from "../composer/copilot-compact-launcher";
import { CopilotComposerSection } from "../composer/copilot-composer-section";
import { CopilotContextDropdown } from "../composer/copilot-context-dropdown";
import type { CopilotPanelContentProps } from "../panel/copilot-panel-content";
import { CopilotDrawerCollapseMorphLayer } from "./copilot-drawer-collapse-morph-layer";
import { COMPACT_LAUNCHER_WIDTH } from "./copilot-drawer-constants";
import { CopilotDrawerSnapOverlays } from "./copilot-drawer-snap-overlays";
import type { CopilotDockMode } from "./copilot-drawer-types";
import { shouldShowCopilotFab } from "./copilot-drawer-utils";
import { CopilotFabTrigger } from "./copilot-fab-trigger";
import type { UseCopilotDrawerLayoutResult } from "./use-copilot-drawer-layout";

export interface CopilotDrawerSurfaceTreeProps {
  /** Combined drag-grip + position-menu trigger for the bottom dock. */
  bottomDockGripMenu?: ReactNode;
  closeLabel: string;
  collapseToCompactLauncher: () => void;
  compactContextOptions: CopilotCompactContextOption[];
  /** Rendered HITL interrupt banner (approval / decision / feedback) for the
   *  compact surfaces' status flap. Built by the drawer body from the gated
   *  `dockInterrupt` so the bottom dock and floating launcher show the same
   *  approval card the docked panel does. Null when nothing is pending. */
  compactInterruptContent?: ReactNode;
  composerPlaceholder: string;
  copilotPositionDropdown: ReactNode;
  copilotSidebarRef: RefObject<HTMLDivElement | null> | undefined;
  dragHandleLabel: string;
  effectiveMode: CopilotDockMode;
  handleCompactContextChange: (contextId: string) => void;
  injected: {
    activeThreadId: string | null;
    draft: string;
    error?: { message?: string | null } | null;
    messages: CopilotPanelContentProps["messages"];
    pendingUserText?: string | null;
    setDraft: CopilotPanelContentProps["setDraft"];
    status: CopilotPanelContentProps["status"];
    submitMessage: CopilotPanelContentProps["submitMessage"];
  };
  layout: UseCopilotDrawerLayoutResult;
  mainContentReady: boolean;
  mainContentRef: RefObject<HTMLElement | null> | undefined;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  panelContent: ReactNode;
  panelContentProps: CopilotPanelContentProps;
  recentCompactContexts: CopilotCompactContextOption[];
  renderCopilotThreadChooser: (variant: "compact" | "panel") => ReactNode;
  selectedCompactContext: CopilotCompactContextOption | undefined;
  selectedCompactContextId: string;
  /** Setter for the preferred dock mode (bottom, floating, etc.). */
  setPreferredDockMode?: (mode: CopilotDockMode | null) => void;
  showCompactLauncher: boolean;
  surfaceInstanceKey: string;
  threadChooserEnabled: boolean;
  title: string | undefined;
}

function renderFabTrigger(input: {
  layout: UseCopilotDrawerLayoutResult;
  onOpenFloat?: () => void;
  onOpenPrompt?: () => void;
  onStartVoice?: () => void;
  open: boolean;
  title: string | undefined;
}) {
  return (
    <CopilotFabTrigger
      ariaLabel={input.title ?? "Open copilot"}
      bottomDockIndicatorStyle={input.layout.bottomDockIndicatorStyle}
      buttonFabIndicatorStyle={input.layout.buttonFabIndicatorStyle}
      dragPosition={
        input.layout.isIconDragging ? input.layout.fabDragPosition : null
      }
      enterFromClose={input.layout.enterFromClose}
      fabPosition={input.layout.fabPosition}
      isActive={input.open}
      isDragging={input.layout.isIconDragging}
      onClick={input.layout.handleFabTriggerClick}
      onOpenFloat={input.onOpenFloat}
      onOpenPrompt={input.onOpenPrompt}
      onPointerDown={input.layout.handleFabTriggerPointerDown}
      onPointerLeave={input.layout.handleFabTriggerPointerLeave}
      onPointerMove={input.layout.handleFabTriggerPointerMove}
      onPointerUp={input.layout.handleFabTriggerPointerUp}
      onStartVoice={input.onStartVoice}
      sidebarDockIndicatorStyle={input.layout.sidebarDockIndicatorStyle}
      snapTarget={input.layout.snapTarget}
      suppressDuringMorph={input.layout.isCollapsingToIcon}
    />
  );
}

function renderCollapseMorph(layout: UseCopilotDrawerLayoutResult) {
  if (!(layout.collapseMorph && layout.collapseMorphPhase)) {
    return null;
  }

  return (
    <CopilotDrawerCollapseMorphLayer
      morph={layout.collapseMorph}
      phase={layout.collapseMorphPhase}
    />
  );
}

function renderDrawerFallback(input: {
  collapseMorph: ReactNode;
  fabTrigger: ReactNode;
  layout: UseCopilotDrawerLayoutResult;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  panelContent: ReactNode;
  surfaceInstanceKey: string;
  title: string | undefined;
}) {
  return (
    <>
      {input.fabTrigger}
      {input.collapseMorph}
      <SidePanel
        key={`drawer:${input.surfaceInstanceKey}`}
        modal={false}
        onOpenChange={input.onOpenChange}
        open={input.open}
      >
        <SidePanelContent
          className={cn(
            "flex h-full min-h-0 w-full max-w-lg flex-col gap-0 overflow-hidden rounded-none border-l-0 bg-card p-0 shadow-none sm:max-w-xl",
            input.layout.isCollapsingToIcon &&
              "pointer-events-none opacity-0 transition-none"
          )}
          data-copilot-drawer-panel
          hideOverlay
          showCloseButton={false}
          side="right"
          style={{ boxShadow: "var(--shadow-shell-copilot-edge)" }}
        >
          <SidePanelTitle className="sr-only">
            {input.title ?? "Enhance"}
          </SidePanelTitle>
          <SidePanelDescription className="sr-only">
            Copilot conversation panel. Use the header menu to switch between
            this page, module list, settings, or global chat.
          </SidePanelDescription>
          {input.panelContent}
        </SidePanelContent>
      </SidePanel>
    </>
  );
}

export function CopilotDrawerSurfaceTree({
  threadChooserEnabled,
  closeLabel,
  collapseToCompactLauncher,
  compactContextOptions,
  compactInterruptContent,
  composerPlaceholder,
  copilotPositionDropdown,
  copilotSidebarRef,
  effectiveMode,
  handleCompactContextChange,
  layout,
  mainContentReady,
  mainContentRef,
  onOpenChange,
  open,
  panelContent,
  panelContentProps,
  recentCompactContexts,
  renderCopilotThreadChooser,
  selectedCompactContext,
  selectedCompactContextId,
  injected,
  setPreferredDockMode,
  showCompactLauncher,
  surfaceInstanceKey,
  title,
  bottomDockGripMenu,
}: CopilotDrawerSurfaceTreeProps) {
  const blobCharacter = useBlobCharacterCycle();
  const [bottomIsMultiline, setBottomIsMultiline] = useState(false);
  const { session: voiceSession } = useCopilotVoice();
  const showFab = shouldShowCopilotFab({
    collapseToCircle: layout.collapseToCircle,
    isCollapsingToIcon: layout.isCollapsingToIcon,
    open,
    showCompactLauncher,
    voiceSessionActive: voiceSession.isActive,
  });

  const handleOpenPrompt = useCallback(() => {
    setPreferredDockMode?.("bottom");
    onOpenChange(true);
  }, [setPreferredDockMode, onOpenChange]);

  const handleOpenFloat = useCallback(() => {
    layout.handleDockPositionSelect("floating");
  }, [layout.handleDockPositionSelect]);

  const fabTrigger = showFab
    ? renderFabTrigger({
        layout,
        onOpenFloat: handleOpenFloat,
        onOpenPrompt: handleOpenPrompt,
        onStartVoice: voiceSession.start,
        open,
        title,
      })
    : null;
  const collapseMorph = renderCollapseMorph(layout);

  if (showCompactLauncher && layout.collapseToCircle && !open) {
    return (
      <>
        {fabTrigger}
        {collapseMorph}
      </>
    );
  }

  // During a voice call with the shell closed, the voice FAB is the single
  // voice surface — the compact launcher would sit next to it as a second,
  // non-voice input.
  if (showCompactLauncher && voiceSession.isActive && !open) {
    return (
      <>
        {fabTrigger}
        {collapseMorph}
      </>
    );
  }

  if (showCompactLauncher) {
    return (
      <>
        {fabTrigger}
        {collapseMorph}
        <CopilotDrawerSnapOverlays
          bottomDockIndicatorStyle={layout.bottomDockIndicatorStyle}
          buttonFabIndicatorStyle={layout.buttonFabIndicatorStyle}
          sidebarDockIndicatorStyle={layout.sidebarDockIndicatorStyle}
          snapTarget={layout.snapTarget}
          variant="compact"
        />
        <div
          className="z-40"
          data-copilot-speech-scope
          key={`launcher:${surfaceInstanceKey}`}
          ref={layout.compactLauncherMeasureRef}
          style={{
            position: "fixed",
            left: layout.floatingPosition.x,
            top: layout.floatingPosition.y,
            width: COMPACT_LAUNCHER_WIDTH,
            maxWidth: `calc(100vw - ${layout.margin * 2}px)`,
          }}
        >
          <CopilotCompactLauncher
            agentTickerErrorMessage={injected.error?.message ?? null}
            agentTickerMessages={injected.messages}
            composerPlaceholder={composerPlaceholder}
            contextControlOverride={
              threadChooserEnabled
                ? renderCopilotThreadChooser("compact")
                : undefined
            }
            contextOptions={compactContextOptions}
            draft={injected.draft}
            dragHandleProps={{
              onPointerDown: layout.handlePointerDown,
              onPointerLeave: layout.handlePointerUp,
              onPointerMove: layout.handlePointerMove,
              onPointerUp: layout.handlePointerUp,
              role: "presentation",
            }}
            interruptContent={compactInterruptContent}
            onNewChat={panelContentProps.onNewChat}
            onSelectContext={handleCompactContextChange}
            pendingUserText={injected.pendingUserText ?? null}
            positionMenu={copilotPositionDropdown}
            recentContextOptions={recentCompactContexts}
            selectedContextId={selectedCompactContext?.id ?? "current"}
            setDraft={injected.setDraft}
            status={injected.status}
            submitMessage={injected.submitMessage}
          />
        </div>
      </>
    );
  }

  if (effectiveMode === "sidebar") {
    const sidebarContainer = copilotSidebarRef?.current;
    const canPortalSidebar = open && sidebarContainer != null;

    return (
      <>
        {fabTrigger}
        {collapseMorph}
        {canPortalSidebar
          ? createPortal(
              <div
                aria-label="Copilot sidebar panel"
                className="flex h-full min-h-0 flex-col overflow-hidden"
                data-copilot-drawer-panel
                data-copilot-speech-scope
                key={`sidebar:${surfaceInstanceKey}`}
                role="region"
              >
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  {panelContent}
                </div>
              </div>,
              sidebarContainer,
              "copilot-inline-sidebar"
            )
          : open
            ? renderDrawerFallback({
                collapseMorph,
                fabTrigger,
                layout,
                onOpenChange,
                open,
                panelContent,
                surfaceInstanceKey,
                title,
              })
            : null}
      </>
    );
  }

  if (
    effectiveMode === "bottom" &&
    mainContentRef?.current &&
    mainContentReady
  ) {
    const bottomContent = (
      <div
        aria-label="Copilot dock"
        className="absolute inset-x-0 bottom-0 z-10 flex justify-center px-3 pt-2 pb-4"
        data-copilot-speech-scope
        key={`bottom:${surfaceInstanceKey}`}
        role="region"
      >
        <div
          className="relative w-full max-w-2xl"
          ref={layout.bottomDockCardRef}
        >
          <CopilotCompactComposerShell
            belowCard={
              panelContentProps.composerLeadingControl ? (
                panelContentProps.composerLeadingControl
              ) : threadChooserEnabled ? (
                renderCopilotThreadChooser("compact")
              ) : (
                <CopilotContextDropdown
                  contextLabel="Context"
                  onSelect={handleCompactContextChange}
                  options={compactContextOptions}
                  recentLabel="Recent"
                  recentOptions={recentCompactContexts}
                  selectedId={selectedCompactContextId}
                  variant="compact"
                />
              )
            }
            chatStatus={injected.status}
            errorMessage={injected.error?.message ?? null}
            interruptContent={compactInterruptContent}
            isMultiline={bottomIsMultiline}
            messages={injected.messages}
            pendingUserText={injected.pendingUserText ?? null}
            threadId={injected.activeThreadId}
            variant="dock-tinted"
          >
            <PromptInputProvider initialInput={injected.draft}>
              <CopilotComposerSection
                compact
                compactCardChrome={
                  bottomDockGripMenu ?? copilotPositionDropdown
                }
                composerPlaceholder={composerPlaceholder}
                draft={injected.draft}
                onMultilineChange={setBottomIsMultiline}
                onNewChat={panelContentProps.onNewChat}
                setDraft={injected.setDraft}
                showStarterPrompts={false}
                status={injected.status}
                submitMessage={injected.submitMessage}
              />
            </PromptInputProvider>
          </CopilotCompactComposerShell>
        </div>
      </div>
    );
    return (
      <>
        {fabTrigger}
        {collapseMorph}
        {open &&
          mainContentRef.current &&
          createPortal(
            bottomContent,
            mainContentRef.current,
            "copilot-bottom-dock"
          )}
      </>
    );
  }

  return renderDrawerFallback({
    collapseMorph,
    fabTrigger,
    layout,
    onOpenChange,
    open,
    panelContent,
    surfaceInstanceKey,
    title,
  });
}
