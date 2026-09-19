"use client";

import type { CopilotLayoutPersistence } from "@engenty/app-shell";
import { useCopilotShellOrNull } from "@engenty/app-shell";
import {
  cn,
  SidePanel,
  SidePanelContent,
  SidePanelDescription,
  SidePanelTitle,
} from "@engenty/ui-core";
import type { ReactNode, RefObject } from "react";
import { useCallback } from "react";
import { createPortal } from "react-dom";
import { useCopilotVoice } from "../../../copilot/copilot-voice-provider.js";
import type { CopilotCompactContextOption } from "../composer/copilot-compact-context-option";
import type { CopilotPanelContentProps } from "../panel/copilot-panel-content";
import { CopilotDrawerCollapseMorphLayer } from "./copilot-drawer-collapse-morph-layer";
import type { CopilotDockMode } from "./copilot-drawer-types";
import { shouldShowCopilotFab } from "./copilot-drawer-utils";
import {
  CopilotFabTrigger,
  type CopilotWhoOption,
} from "./copilot-fab-trigger";
import { CopilotWindowSurface } from "./copilot-window-surface";
import type { UseCopilotDrawerLayoutResult } from "./use-copilot-drawer-layout";

export interface CopilotDrawerSurfaceTreeProps {
  closeLabel: string;
  compactContextOptions: CopilotCompactContextOption[];
  composerPlaceholder: string;
  /** Desktop app-bar blob slot. When attached, the avatar portals here. */
  copilotDockRef?: RefObject<HTMLDivElement | null> | undefined;
  /** Layout persistence — the `window` mode stores its rect here. */
  copilotLayout?: CopilotLayoutPersistence | null;
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
  onOpenChat?: () => void;
  onOpenPrompt?: () => void;
  open: boolean;
  panelContent: ReactNode;
  panelContentProps: CopilotPanelContentProps;
  preferredDockMode?: CopilotDockMode | null;
  recentCompactContexts: CopilotCompactContextOption[];
  renderCopilotThreadChooser: (variant: "compact" | "panel") => ReactNode;
  selectedCompactContext: CopilotCompactContextOption | undefined;
  selectedCompactContextId: string;
  setPreferredDockMode?: (mode: CopilotDockMode | null) => void;
  surfaceInstanceKey: string;
  threadChooserEnabled: boolean;
  title: string | undefined;
  whoOptions?: CopilotWhoOption[];
  /** Window chrome: who chooser, session, new chat, position, close. */
  windowTitleBar?: ReactNode;
}

function renderFabTrigger(input: {
  docked: boolean;
  onOpenChat?: () => void;
  onOpenPrompt?: () => void;
  onStartVoice?: () => void;
  open: boolean;
  title: string | undefined;
  triggerClick: () => void;
  whoOptions?: CopilotWhoOption[];
}) {
  return (
    <CopilotFabTrigger
      ariaLabel={input.title ?? "Open copilot"}
      docked={input.docked}
      isActive={input.open}
      onClick={input.triggerClick}
      onOpenChat={input.onOpenChat}
      onOpenPrompt={input.onOpenPrompt}
      onStartVoice={input.onStartVoice}
      whoOptions={input.whoOptions}
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
  copilotLayout = null,
  copilotDockRef,
  copilotSidebarRef,
  dragHandleLabel,
  effectiveMode,
  layout,
  onOpenChange,
  onOpenChat,
  onOpenPrompt,
  open,
  panelContent,
  surfaceInstanceKey,
  title,
  whoOptions,
  windowTitleBar,
}: CopilotDrawerSurfaceTreeProps) {
  const { session: voiceSession } = useCopilotVoice();
  const shell = useCopilotShellOrNull();
  const dockContainer =
    shell?.copilotDockReady === true
      ? (shell.copilotDockRef.current ?? copilotDockRef?.current ?? null)
      : null;
  const docked = dockContainer != null;
  const showFab = shouldShowCopilotFab({
    chromeHidden: shell?.chromeHidden,
    collapseToCircle: layout.collapseToCircle,
    docked,
    isCollapsingToIcon: layout.isCollapsingToIcon,
    open,
    voiceSessionActive: voiceSession.isActive,
  });

  const handleOpenPrompt = useCallback(() => {
    onOpenPrompt?.();
  }, [onOpenPrompt]);

  const fabTrigger = showFab
    ? renderFabTrigger({
        docked,
        onOpenChat,
        onOpenPrompt: handleOpenPrompt,
        onStartVoice: voiceSession.start,
        open,
        title,
        triggerClick: layout.handleFabTriggerClick,
        whoOptions,
      })
    : null;
  const dockedFab =
    fabTrigger && dockContainer
      ? createPortal(fabTrigger, dockContainer, "copilot-rail-dock")
      : docked
        ? null
        : fabTrigger;
  const collapseMorph = renderCollapseMorph(layout);

  if (!open) {
    return (
      <>
        {dockedFab}
        {collapseMorph}
      </>
    );
  }

  if (effectiveMode === "sidebar") {
    const sidebarContainer = copilotSidebarRef?.current;
    const canPortalSidebar = sidebarContainer != null;

    return (
      <>
        {dockedFab}
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
          : renderDrawerFallback({
              collapseMorph,
              fabTrigger: dockedFab,
              layout,
              onOpenChange,
              open,
              panelContent,
              surfaceInstanceKey,
              title,
            })}
      </>
    );
  }

  if (effectiveMode === "window") {
    return (
      <>
        {dockedFab}
        {collapseMorph}
        <CopilotWindowSurface
          copilotLayout={copilotLayout}
          dragHandleLabel={dragHandleLabel}
          surfaceInstanceKey={surfaceInstanceKey}
          title={title}
          titleBar={windowTitleBar ?? null}
        >
          {panelContent}
        </CopilotWindowSurface>
      </>
    );
  }

  return renderDrawerFallback({
    collapseMorph,
    fabTrigger: dockedFab,
    layout,
    onOpenChange,
    open,
    panelContent,
    surfaceInstanceKey,
    title,
  });
}
