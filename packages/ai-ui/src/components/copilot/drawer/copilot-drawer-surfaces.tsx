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
import { createPortal } from "react-dom";
import { useCopilotVoice } from "../../../copilot/copilot-voice-provider.js";
import type { CopilotCompactContextOption } from "../composer/copilot-compact-context-option";
import { CopilotDrawerCollapseMorphLayer } from "./copilot-drawer-collapse-morph-layer";
import type { CopilotDockMode } from "./copilot-drawer-types";
import { shouldShowCopilotFab } from "./copilot-drawer-utils";
import { CopilotFabTrigger } from "./copilot-fab-trigger";
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
  /** Blob "on" state. Defaults to `open`; a talk page sets it too. */
  isActive?: boolean;
  layout: UseCopilotDrawerLayoutResult;
  mainContentReady: boolean;
  mainContentRef: RefObject<HTMLElement | null> | undefined;
  /** Blob click. Falls back to the layout's open/collapse toggle. */
  onFabClick?: () => void;
  onOpenChange: (open: boolean) => void;
  onOpenCopilot?: () => void;
  onSubmitPrompt?: (text: string) => void;
  open: boolean;
  panelContent: ReactNode;
  preferredDockMode?: CopilotDockMode | null;
  recentCompactContexts: CopilotCompactContextOption[];
  selectedCompactContext: CopilotCompactContextOption | undefined;
  selectedCompactContextId: string;
  setPreferredDockMode?: (mode: CopilotDockMode | null) => void;
  surfaceInstanceKey: string;
  title: string | undefined;
  /** Window chrome: who chooser, session, new chat, position, close. */
  windowTitleBar?: ReactNode;
}

function renderFabTrigger(input: {
  active: boolean;
  docked: boolean;
  onOpenCopilot?: () => void;
  onStartVoice?: () => void;
  onSubmitPrompt?: (text: string) => void;
  open: boolean;
  promptPlaceholder?: string;
  title: string | undefined;
  triggerClick: () => void;
}) {
  return (
    <CopilotFabTrigger
      ariaLabel={input.title ?? "Open copilot"}
      docked={input.docked}
      isActive={input.active}
      onClick={input.triggerClick}
      onOpenCopilot={input.onOpenCopilot}
      onStartVoice={input.onStartVoice}
      onSubmitPrompt={input.onSubmitPrompt}
      {...(input.promptPlaceholder
        ? { promptPlaceholder: input.promptPlaceholder }
        : {})}
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
  onFabClick,
  onOpenChange,
  composerPlaceholder,
  isActive,
  onOpenCopilot,
  onSubmitPrompt,
  open,
  panelContent,
  surfaceInstanceKey,
  title,
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

  const fabTrigger = showFab
    ? renderFabTrigger({
        active: isActive ?? open,
        docked,
        onOpenCopilot,
        onStartVoice: voiceSession.start,
        onSubmitPrompt,
        open,
        promptPlaceholder: composerPlaceholder,
        title,
        triggerClick: onFabClick ?? layout.handleFabTriggerClick,
      })
    : null;
  const dockedFab =
    fabTrigger && dockContainer
      ? createPortal(fabTrigger, dockContainer, "copilot-rail-dock")
      : docked
        ? null
        : fabTrigger;
  const collapseMorph = renderCollapseMorph(layout);

  // A page that already shows the conversation full width (the river's own
  // page, a hub chat) owns the surface: nothing to draw beside it, and the
  // persisted `open` stays as it is for the next page.
  if (!open || shell?.chromeHidden) {
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
