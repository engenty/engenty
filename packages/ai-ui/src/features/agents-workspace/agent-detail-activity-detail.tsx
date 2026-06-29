// Session detail pane under the Activity tab — the in-page session transcript
// preserved from the old Sessions tab (ui-6 batch 3).

import { AgentSessionsPane } from "./agent-sessions-pane";
import type { useAgentDetail } from "./use-agent-detail";
import type { useAgentSessionsTab } from "./use-agent-sessions-tab";

interface AgentDetailActivityDetailProps {
  detail: ReturnType<typeof useAgentDetail>;
  sessions: ReturnType<typeof useAgentSessionsTab>;
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
      <AgentSessionsPane
        agentId={agentId}
        isLoading={sessions.sessionsQuery.isLoading}
        onBackToSessions={() => detail.navigateToAgentActivity(agentId)}
        onOpenSession={(threadId) =>
          detail.navigateToAgentSession(
            agentId,
            threadId,
            detail.sessionsFilter
          )
        }
        routeSelectedSessionId={detail.selectedThreadId}
        sessions={sessions.filteredSessions}
        sessionsFilter={detail.sessionsFilter}
        setSessionsFilter={detail.setSessionsFilterParam}
        t={t}
      />
    </div>
  );
}
