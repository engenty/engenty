import { useMemo } from "react";
import type { AiAdminThreadRow } from "../../lib/admin/ai-runtime-api.js";
import { useAdminAiThreadsQuery } from "../../lib/admin/ai-runtime-queries.js";

export function filterAdminThreads(
  threads: AiAdminThreadRow[],
  filter: string
) {
  const normalizedFilter = filter.trim().toLowerCase();
  if (!normalizedFilter) {
    return threads;
  }

  return threads.filter((thread) => {
    const summary = thread.summary?.toLowerCase() ?? "";
    const title = thread.title?.toLowerCase() ?? "";
    const agent = thread.current_agent_id?.toLowerCase() ?? "";
    return (
      thread.id.toLowerCase().includes(normalizedFilter) ||
      thread.status.toLowerCase() === normalizedFilter ||
      agent.includes(normalizedFilter) ||
      title.includes(normalizedFilter) ||
      summary.includes(normalizedFilter)
    );
  });
}

export function sortAdminThreadsByRecency(threads: AiAdminThreadRow[]) {
  return threads.toSorted(
    (left, right) =>
      new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
  );
}

export function useAgentThreadsTab(params: {
  selectedAgentId: string | null;
  threadsFilter: string;
}) {
  const threadsQuery = useAdminAiThreadsQuery(
    params.selectedAgentId ? { agentId: params.selectedAgentId } : null,
    Boolean(params.selectedAgentId)
  );

  const filteredThreads = useMemo(
    () =>
      sortAdminThreadsByRecency(
        filterAdminThreads(
          threadsQuery.data?.sessions ?? [],
          params.threadsFilter
        )
      ),
    [params.threadsFilter, threadsQuery.data?.sessions]
  );

  return {
    filteredThreads,
    threadsQuery,
  };
}
