"use client";

import type { AgentDeskAgent } from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  ACTIVE_COPILOT_AGENT_ID,
  ENGENTY_COPILOT_HOST_KEY,
} from "../../../agent-provider/host-keys.js";
import { useCopilotRiver } from "../../../copilot/copilot-river.js";
import { useCopilotVoice } from "../../../copilot/copilot-voice-provider.js";
import { AgentDeskChatPanel } from "../../../features/agent-desk/agent-desk-chat-panel.js";
import { AgentDeskHeader } from "../../../features/agent-desk/agent-desk-header.js";
import { DeskMessage } from "../../../features/agent-desk/desk-frame.js";
import { useAgentDeskFeed } from "../../../features/agent-desk/use-agent-desk-feed.js";
import { useAgentDeskThread } from "../../../features/agent-desk/use-agent-desk-thread.js";
import { BrowserTargetProvider } from "../../../features/browser/browser-target.js";
import { CopilotBrowserPanel } from "../../../features/browser/copilot-browser-panel.js";
import { useMentionAgentCandidates } from "../../../hooks/use-mention-agent-candidates.js";
import { CopilotPanelInlineHeader } from "../panel/copilot-panel-header.js";
import type {
  CopilotDrawerProps,
  CopilotPanelMode,
} from "./copilot-drawer-types";

function CopilotCompanionIdentity(props: {
  agent: AgentDeskAgent;
  collapsed: boolean;
  hostKey: string;
  lastActivityAt: string | null;
  /** Title row on the colored band. Only the compact (sticky) header uses it. */
  toolbar?: ReactNode;
}) {
  return (
    <AgentDeskHeader
      agent={props.agent}
      bandGutterClassName="px-3 pb-2"
      chatKind="copilot"
      collapsed={props.collapsed}
      hostKey={props.hostKey}
      lastActivityAt={props.lastActivityAt}
      toolbar={props.collapsed ? props.toolbar : undefined}
      topbarClearance={false}
      visibility="private"
    />
  );
}

export function CopilotCompanionLane(props: {
  attachLabel: string;
  closeLabel: string;
  composerFocusToken: number;
  composerLeadingControl: ReactNode;
  composerPlaceholder: string;
  copilotPositionDropdown: ReactNode;
  effectiveMode: CopilotDrawerProps["dockMode"];
  handleHeaderClose: () => void;
  handleSurfacePanelModeChange: (mode: CopilotPanelMode) => void;
  /** Window title row, drawn on the colored band instead of above it. */
  headerToolbar?: ReactNode;
  headerChrome: CopilotDrawerProps["headerChrome"];
  isFloatingStyle: boolean;
  onSandboxApproved?: () => void;
  starterPrompts: CopilotDrawerProps["starterPrompts"];
  surfaceInstanceKey: string;
  title: string | undefined;
}) {
  const { t } = useTranslation("common");
  const { t: tAi } = useTranslation("ai-ui");
  const { i18n } = useTranslation("common");
  const locale = i18n.language || "en";
  const river = useCopilotRiver();
  const realtimeVoice = useCopilotVoice();
  const hostKey = ENGENTY_COPILOT_HOST_KEY;
  const deskThread = useAgentDeskThread(hostKey, river.threadId);
  const feedQuery = useAgentDeskFeed({
    agentId: ACTIVE_COPILOT_AGENT_ID,
    locale,
    spaceId: null,
  });
  const mentionAgentCandidates = useMentionAgentCandidates();
  const [browserPanelOpen, setBrowserPanelOpen] = useState(false);
  const agent = feedQuery.data?.agent;

  if (!agent) {
    return <DeskMessage>{t("shell.loading")}</DeskMessage>;
  }

  const lastActivityAt = deskThread.thread.session?.updated_at ?? null;
  // Sidebar, window, and drawer keep the full-screen header: the title row
  // and the readers line on one colored band, even when nothing has scrolled.
  // Sidebar and window still show the intro itself while the chat is empty.
  const showEmptyIntro =
    props.effectiveMode === "sidebar" || props.effectiveMode === "window";
  const titleRow =
    props.effectiveMode === "window" ? (
      props.headerToolbar
    ) : (
      <CopilotPanelInlineHeader
        attachLabel={props.attachLabel}
        browserPanelLabel={tAi("browser.panel.toggle")}
        browserPanelOpen={browserPanelOpen}
        chatKind="copilot"
        closeLabel={props.closeLabel}
        detachLabel={t("copilot.position.window")}
        headerChrome={props.headerChrome ?? "default"}
        headerVariant="docked"
        onBand
        onClose={props.handleHeaderClose}
        onPanelModeChange={props.handleSurfacePanelModeChange}
        onToggleBrowserPanel={() => setBrowserPanelOpen((value) => !value)}
        panelMode="docked"
        positionMenu={props.copilotPositionDropdown}
        title={props.title ?? t("copilot.title")}
      />
    );

  return (
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
        attachLabel: props.attachLabel,
        bodyOnly: true,
        browserPanel:
          props.isFloatingStyle || !browserPanelOpen ? null : (
            // The copilot's window in the personal Space's browser.
            <BrowserTargetProvider value={{ agentId: agent.id, spaceId: null }}>
              <CopilotBrowserPanel />
            </BrowserTargetProvider>
          ),
        browserPanelLabel: tAi("browser.panel.toggle"),
        browserPanelOpen: props.isFloatingStyle ? false : browserPanelOpen,
        centerEmptyLanding: props.isFloatingStyle ? false : undefined,
        chatKind: props.isFloatingStyle ? null : "copilot",
        closeLabel: props.closeLabel,
        detachLabel: t("copilot.position.window"),
        headerChrome: props.headerChrome,
        headerVariant: props.isFloatingStyle ? "floating" : "docked",
        onClose: props.handleHeaderClose,
        onPanelModeChange: props.handleSurfacePanelModeChange,
        onToggleBrowserPanel: props.isFloatingStyle
          ? undefined
          : () => setBrowserPanelOpen((value) => !value),
        panelMode: props.isFloatingStyle ? "floating" : "docked",
        positionMenu: props.copilotPositionDropdown,
        title: props.title ?? t("copilot.title"),
      }}
      composerFocusToken={props.composerFocusToken}
      composerLeadingControl={props.composerLeadingControl}
      composerPlaceholder={props.composerPlaceholder}
      contextPane={false}
      hostKey={hostKey}
      initialMessages={deskThread.initialMessages}
      isLoadingMessages={deskThread.isLoadingMessages}
      key={`panel:${props.surfaceInstanceKey}`}
      mentionAgentCandidates={mentionAgentCandidates}
      olderMessages={deskThread.olderMessages}
      onSandboxApproved={props.onSandboxApproved}
      openInterruptFromSession={deskThread.openInterruptFromSession}
      realtimeVoice={realtimeVoice}
      scrollHeader={
        showEmptyIntro ? (
          <CopilotCompanionIdentity
            agent={agent}
            collapsed={false}
            hostKey={hostKey}
            lastActivityAt={lastActivityAt}
          />
        ) : undefined
      }
      spaceId={null}
      starterPromptsOverride={props.starterPrompts}
      stickyBand={
        <CopilotCompanionIdentity
          agent={agent}
          collapsed
          hostKey={hostKey}
          lastActivityAt={lastActivityAt}
          toolbar={titleRow}
        />
      }
      thread={deskThread.thread.session}
    />
  );
}
