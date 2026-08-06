// Session detail pane under the Activity tab — the in-page session transcript
// preserved from the old Sessions tab (ui-6 batch 3).

import { AgentThreadsPane } from "./agent-threads-pane.js";
import type { useAgentDetail } from "./use-agent-detail.js";
import type { useAgentThreadsTab } from "./use-agent-threads-tab.js";

interface AgentDetailActivityDetailProps {
  detail: ReturnType<typeof useAgentDetail>;
  sessions: ReturnType<typeof useAgentThreadsTab>;
  t: (key: string) => string;
}

export function AgentDetailActivityDetail({
  detail,
  sessions,
  t,
}: AgentDetailActivityDetailProps) {
  const agentId = detail.selectedAgent?.id ?? "";

  return (
    <div className="min-h-0 flex-1 overflow-auto p-page">
      <AgentThreadsPane
        agentId={agentId}
        isLoading={sessions.threadsQuery.isLoading}
        onBackToThreads={() => detail.navigateToAgentActivity(agentId)}
        onOpenThread={(threadId) =>
          detail.navigateToAgentSession(
            agentId,
            threadId,
            detail.sessionsFilter
          )
        }
        routeSelectedThreadId={detail.selectedThreadId}
        setThreadsFilter={detail.setSessionsFilterParam}
        t={t}
        threads={sessions.filteredThreads}
        threadsFilter={detail.sessionsFilter}
      />
    </div>
  );
}
