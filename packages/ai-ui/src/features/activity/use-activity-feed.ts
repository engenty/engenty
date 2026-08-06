// Data hook for the activity feed (ui-6 §5): lists admin sessions (threads),
// filters, groups by day, and live-polls only while a running entry exists.

import { useEffect, useMemo, useState } from "react";
import { useAdminAiThreadsQuery } from "../../lib/admin/ai-runtime-queries.js";
import {
  type ActivityDayGroup,
  groupActivityEntriesByDay,
} from "./activity-day-groups.js";
import {
  type ActivityEntry,
  type ActivityFilterState,
  filterActivityEntries,
  hasRunningActivityEntry,
  toActivityEntries,
} from "./activity-entries.js";

export interface UseActivityFeedResult {
  entries: ActivityEntry[];
  groups: ActivityDayGroup[];
  isError: boolean;
  isLoading: boolean;
  isPolling: boolean;
}

export function useActivityFeed(params: {
  filters: ActivityFilterState;
  /** Fixed-agent mode (agent detail tab): overrides the agent filter. */
  fixedAgentId?: string | null;
}): UseActivityFeedResult {
  const agentId = params.fixedAgentId ?? params.filters.agentId;
  const [livePoll, setLivePoll] = useState(false);

  const sessionsQuery = useAdminAiThreadsQuery(
    agentId ? { agentId } : null,
    livePoll
  );

  const entries = useMemo(
    () =>
      filterActivityEntries(
        toActivityEntries({
          sessions: sessionsQuery.data?.sessions ?? [],
        }),
        { ...params.filters, agentId }
      ),
    [agentId, params.filters, sessionsQuery.data?.sessions]
  );

  const groups = useMemo(() => groupActivityEntriesByDay(entries), [entries]);

  const shouldPoll = hasRunningActivityEntry(entries);
  useEffect(() => {
    setLivePoll(shouldPoll);
  }, [shouldPoll]);

  return {
    entries,
    groups,
    isError: sessionsQuery.isError,
    isLoading: sessionsQuery.isLoading,
    isPolling: livePoll,
  };
}
