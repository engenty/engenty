import { useMemo } from "react";
import type { AiAdminSessionRow } from "../../lib/admin/ai-runtime-api";
import { useAdminAiSessionsQuery } from "../../lib/admin/ai-runtime-queries";

export function filterAdminSessions(
  sessions: AiAdminSessionRow[],
  filter: string
) {
  const normalizedFilter = filter.trim().toLowerCase();
  if (!normalizedFilter) {
    return sessions;
  }

  return sessions.filter((session) => {
    const summary = session.summary?.toLowerCase() ?? "";
    const title = session.title?.toLowerCase() ?? "";
    const agent = session.current_agent_id?.toLowerCase() ?? "";
    return (
      session.id.toLowerCase().includes(normalizedFilter) ||
      session.status.toLowerCase() === normalizedFilter ||
      agent.includes(normalizedFilter) ||
      title.includes(normalizedFilter) ||
      summary.includes(normalizedFilter)
    );
  });
}

export function sortAdminSessionsByRecency(sessions: AiAdminSessionRow[]) {
  return sessions.toSorted(
    (left, right) =>
      new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
  );
}

export function useAgentSessionsTab(params: {
  selectedAgentId: string | null;
  sessionsFilter: string;
}) {
  const sessionsQuery = useAdminAiSessionsQuery(
    params.selectedAgentId ? { agentId: params.selectedAgentId } : null,
    Boolean(params.selectedAgentId)
  );

  const filteredSessions = useMemo(
    () =>
      sortAdminSessionsByRecency(
        filterAdminSessions(
          sessionsQuery.data?.sessions ?? [],
          params.sessionsFilter
        )
      ),
    [params.sessionsFilter, sessionsQuery.data?.sessions]
  );

  return {
    filteredSessions,
    sessionsQuery,
  };
}
