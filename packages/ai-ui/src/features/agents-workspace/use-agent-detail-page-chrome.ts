// Breadcrumbs + tab badges for the agent detail page (ui-6 §3 chrome).

import { useMemo } from "react";
import type { AgentDetailTabBadge } from "./agent-detail-tab-bar.js";
import type { AgentDetailTab } from "./agent-detail-tabs.js";
import {
  AGENTS_CATALOG_ROOT_PATH,
  buildAgentDetailPath,
} from "./agent-workspace-url-state.js";
import type { useAgentDetail } from "./use-agent-detail.js";
import type { useAgentThreadsTab } from "./use-agent-threads-tab.js";

export function useAgentDetailPageChrome(params: {
  activeTab: AgentDetailTab;
  detail: ReturnType<typeof useAgentDetail>;
  sessions: ReturnType<typeof useAgentThreadsTab>;
  t: (key: string) => string;
}) {
  const { activeTab, detail, sessions, t } = params;

  const breadcrumbs = useMemo(() => {
    const root = {
      label: t("workspace.sidebarAgents"),
      to: AGENTS_CATALOG_ROOT_PATH,
    };
    if (!detail.selectedAgent) {
      return [root];
    }
    if (activeTab === "overview") {
      return [root, { label: detail.selectedAgent.name }];
    }
    return [
      root,
      {
        label: detail.selectedAgent.name,
        to: buildAgentDetailPath(detail.selectedAgent.id),
      },
      { label: t(`agentDetail.tabs.${activeTab}`) },
    ];
  }, [activeTab, detail.selectedAgent, t]);

  const activityInFlight = (sessions.threadsQuery.data?.sessions ?? []).some(
    (row) => row.status === "running" || row.status === "waiting"
  );

  const tabBadges: Partial<Record<AgentDetailTab, AgentDetailTabBadge>> =
    detail.selectedAgent
      ? {
          activity: {
            count: sessions.threadsQuery.data?.sessions.length ?? 0,
            showSpinner: activityInFlight,
          },
          instructions: { count: detail.agentDocuments.length },
        }
      : {};

  return { breadcrumbs, tabBadges };
}
