// /admin/engenty/agents/:agentId — agent "personnel file" (ui-6 §3).
// Tabs: Overview · Capabilities · Files · Activity.

import { useTranslation } from "@engenty/i18n/ui";
import { Badge, DetailPageHeader, Tabs } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useEffect, useRef, useState } from "react";
import { AgentDetailTabBar } from "../features/agents-workspace/agent-detail-tab-bar.js";
import { AgentDetailTabContent } from "../features/agents-workspace/agent-detail-tab-content.js";
import {
  type AgentDetailTab,
  getAgentDetailAffordances,
  resolveAgentDetailTab,
} from "../features/agents-workspace/agent-detail-tabs.js";
import { AgentRegistryChatActiveToggle } from "../features/agents-workspace/agent-registry-chat-active-toggle.js";
import { useAgentDetail } from "../features/agents-workspace/use-agent-detail.js";
import { useAgentDetailPageChrome } from "../features/agents-workspace/use-agent-detail-page-chrome.js";
import { useAgentFilesTab } from "../features/agents-workspace/use-agent-files-tab.js";
import { useAgentThreadsTab } from "../features/agents-workspace/use-agent-threads-tab.js";
import { useAgentWorkspaceTab } from "../features/agents-workspace/use-agent-workspace-tab.js";
import { useAgentsWorkspaceShellNav } from "../features/agents-workspace/use-agents-workspace-shell-nav.js";

export function AgentDetailPage() {
  const { t } = useTranslation("ai-ui");
  const detail = useAgentDetail();
  const files = useAgentFilesTab({
    activeSection: detail.activeSection,
    agentDocuments: detail.agentDocuments,
    selectedKey: detail.selectedKey,
    setFileParam: detail.setFileParam,
    t,
  });
  const sessions = useAgentThreadsTab({
    selectedAgentId: detail.selectedAgent?.id ?? null,
    threadsFilter: detail.sessionsFilter,
  });

  const requestedTab = resolveAgentDetailTab(detail.activeSection);
  const affordances = getAgentDetailAffordances(detail.selectedAgent);
  const activeTab: AgentDetailTab = affordances.visibleTabs.includes(
    requestedTab
  )
    ? requestedTab
    : "overview";

  const workspace = useAgentWorkspaceTab({
    activeTab,
    agentId: detail.selectedAgent?.id ?? null,
    t,
  });

  const chrome = useAgentDetailPageChrome({
    activeTab,
    detail,
    sessions,
    t,
  });

  const shellNav = useAgentsWorkspaceShellNav({
    agents: detail.agents,
    flows: detail.workspaceNavFlows,
    flowsLoading: detail.flowsLoading,
    onSelectAgent: detail.navigateToAgent,
    onSelectFlow: detail.navigateToFlow,
    onSelectSkill: detail.navigateToSkill,
    selectedAgentId: detail.selectedAgentId,
    skills: detail.workspaceNavSkills,
    skillsLoading: detail.skillsAdminQuery.isLoading,
  });

  usePageConfig({
    breadcrumbs: chrome.breadcrumbs,
    contentStackBackground: "paper",
    secondaryNavAfterItems: shellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: shellNav.secondaryNavHeaderSlot,
    // Float the transparent topbar over the white header so the two blend.
    topbarOverlap: true,
  });

  // Collapse the header once the active tab's content is scrolled. Scroll
  // events don't bubble, so a capturing listener on the wrapper catches any
  // descendant scroll container (each tab manages its own scroll).
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const [headerCollapsed, setHeaderCollapsed] = useState(
    activeTab === "instructions" || activeTab === "workspace"
  );
  useEffect(
    () =>
      setHeaderCollapsed(
        activeTab === "instructions" || activeTab === "workspace"
      ),
    [activeTab]
  );
  useEffect(() => {
    const root = scrollRootRef.current;
    if (!root) {
      return;
    }
    const onScroll = (event: Event) => {
      const el = event.target as HTMLElement | null;
      if (!el || typeof el.scrollTop !== "number") {
        return;
      }
      // Ignore horizontal-only scrollers (e.g. the tab strip) — they fire with
      // scrollTop 0 and would wrongly expand the header.
      if (el.scrollHeight <= el.clientHeight) {
        return;
      }
      setHeaderCollapsed(el.scrollTop > 16);
    };
    root.addEventListener("scroll", onScroll, true);
    return () => root.removeEventListener("scroll", onScroll, true);
  }, []);

  const onTabChange = (value: string) => {
    const agent = detail.selectedAgent;
    if (!agent) {
      return;
    }
    if (value === "capabilities") {
      detail.navigateToAgentCapabilities(agent.id);
    } else if (value === "instructions") {
      detail.navigateToAgentInstructions(
        agent.id,
        detail.selectedKey || detail.agentDocuments[0]?.document_key || null
      );
    } else if (value === "workspace") {
      detail.navigateToAgentWorkspace(agent.id);
    } else if (value === "memory") {
      detail.navigateToAgentMemory(agent.id);
    } else if (value === "files") {
      detail.navigateToAgentFiles(agent.id);
    } else if (value === "activity") {
      detail.navigateToAgentActivity(agent.id);
    } else {
      detail.navigateToAgent(agent.id);
    }
  };

  return (
    <div
      className="flex h-full min-h-0 w-full flex-1 flex-col"
      ref={scrollRootRef}
    >
      <Tabs
        className="flex h-full min-h-0 flex-1 flex-col"
        onValueChange={onTabChange}
        value={activeTab}
      >
        <DetailPageHeader
          belowStrip={
            <AgentDetailTabBar
              badges={chrome.tabBadges}
              t={t}
              tabs={affordances.visibleTabs}
            />
          }
          collapsed={headerCollapsed}
          description={
            detail.selectedAgent?.description ? (
              <p className="text-muted-foreground text-sm">
                {detail.selectedAgent.description}
              </p>
            ) : null
          }
          eyebrow={
            detail.selectedAgent ? (
              <>
                <span className="font-medium text-foreground">
                  {detail.selectedAgent.id}
                </span>
                <span className="mx-1.5">·</span>
                <span>{detail.selectedAgent.module_id}</span>
              </>
            ) : null
          }
          maxWidth="7xl"
          status={
            detail.selectedAgent &&
            (affordances.showChatActiveToggle ||
              detail.selectedAgent.is_synthetic) ? (
              <div className="flex items-center gap-2">
                {detail.selectedAgent.is_synthetic ? (
                  <Badge variant="outline">{t("agents.syntheticAgent")}</Badge>
                ) : null}
                {affordances.showChatActiveToggle ? (
                  <AgentRegistryChatActiveToggle
                    agent={detail.selectedAgent}
                    locked={affordances.chatActiveLocked}
                    t={t}
                  />
                ) : null}
              </div>
            ) : null
          }
          title={detail.selectedAgent?.name ?? ""}
        />

        <AgentDetailTabContent
          activeTab={activeTab}
          affordances={affordances}
          detail={detail}
          files={files}
          sessions={sessions}
          t={t}
          workspace={workspace}
        />
      </Tabs>
    </div>
  );
}
