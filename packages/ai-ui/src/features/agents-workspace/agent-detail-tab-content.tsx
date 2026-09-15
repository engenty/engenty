// Tab-content switch for the agent detail "personnel file" (ui-6 §3).

import { Card, CardContent } from "@engenty/ui-core";
import { AgentActivityTab } from "./agent-activity-tab.js";
import { AgentCapabilitiesTab } from "./agent-capabilities-tab.js";
import { AgentDetailActivityDetail } from "./agent-detail-activity-detail.js";
import { AgentDetailFilesTab } from "./agent-detail-files-tab.js";
import { AgentDetailMemoryTab } from "./agent-detail-memory-tab.js";
import type {
  AgentDetailAffordances,
  AgentDetailTab,
} from "./agent-detail-tabs.js";
import { AgentDetailWorkspaceTab } from "./agent-detail-workspace-tab.js";
import { AgentOverviewTab } from "./agent-overview-tab.js";
import type { useAgentDetail } from "./use-agent-detail.js";
import type { useAgentFilesTab } from "./use-agent-files-tab.js";
import type { useAgentThreadsTab } from "./use-agent-threads-tab.js";
import type { useAgentWorkspaceTab } from "./use-agent-workspace-tab.js";

interface AgentDetailTabContentProps {
  activeTab: AgentDetailTab;
  affordances: AgentDetailAffordances;
  detail: ReturnType<typeof useAgentDetail>;
  files: ReturnType<typeof useAgentFilesTab>;
  sessions: ReturnType<typeof useAgentThreadsTab>;
  t: (key: string) => string;
  workspace: ReturnType<typeof useAgentWorkspaceTab>;
}

export function AgentDetailTabContent({
  activeTab,
  affordances,
  detail,
  files,
  sessions,
  workspace,
  t,
}: AgentDetailTabContentProps) {
  const agent = detail.selectedAgent;
  if (!agent) {
    return (
      <div className="p-page">
        <Card className="border bg-card">
          <CardContent className="p-5 text-muted-foreground text-sm">
            {detail.agentsQuery.isLoading
              ? t("agents.loading")
              : t("agents.selectHint")}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (activeTab === "instructions") {
    return <AgentDetailFilesTab detail={detail} files={files} t={t} />;
  }

  // Files = the same browser, held on `/home`: the hook reads the tab and
  // pins the mount, so nothing here differs but the frame.
  if (activeTab === "workspace" || activeTab === "files") {
    return <AgentDetailWorkspaceTab t={t} workspace={workspace} />;
  }

  if (activeTab === "memory") {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-auto">
        <div className="mx-auto w-full max-w-4xl space-y-6 p-page">
          <AgentDetailMemoryTab
            agentId={agent.id}
            editable={!affordances.isExternal}
          />
        </div>
      </div>
    );
  }

  if (activeTab === "activity") {
    // Session detail sub-route keeps its full transcript pane; the plain tab is
    // the shared day-grouped feed fixed to this agent (ui-6 §5 reuse).
    if (detail.selectedThreadId) {
      return (
        <AgentDetailActivityDetail detail={detail} sessions={sessions} t={t} />
      );
    }
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-auto p-page">
        <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col">
          <AgentActivityTab agentId={agent.id} agentName={agent.name} t={t} />
        </div>
      </div>
    );
  }

  if (activeTab === "capabilities") {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-auto">
        <div className="mx-auto w-full max-w-4xl space-y-6 p-page">
          <AgentCapabilitiesTab
            actions={detail.selectedAgentActions}
            agent={agent}
            isSkillsLoading={detail.skillCatalogQuery.isLoading}
            skills={detail.skillCatalogQuery.data?.skills ?? []}
            t={t}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-auto">
      <div className="mx-auto w-full max-w-4xl space-y-6 p-page">
        <AgentOverviewTab
          affordances={affordances}
          agent={agent}
          agentActions={detail.selectedAgentActions}
          documents={detail.agentDocuments}
          onOpenInstruction={(documentKey) =>
            detail.navigateToAgentInstructions(agent.id, documentKey)
          }
          t={t}
        />
      </div>
    </div>
  );
}
