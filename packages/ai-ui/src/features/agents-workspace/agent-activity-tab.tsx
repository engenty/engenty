// Activity tab (ui-6 §3): the shared ActivityFeed fixed to this agent.
// The /sessions/:threadId detail sub-route renders its pane from
// agent-detail-tab-content; this component is the list view only.

import { useState } from "react";
import type { ActivityFilterState } from "../activity/activity-entries";
import { ActivityFeed } from "../activity/activity-feed";
import { ActivityFilterBar } from "../activity/activity-filter-bar";
import { useActivityFeed } from "../activity/use-activity-feed";

const INITIAL_FILTERS: ActivityFilterState = {
  agentId: null,
  search: "",
  status: "all",
};

export function AgentActivityTab({
  agentId,
  agentName,
  t,
}: {
  agentId: string;
  agentName: string;
  t: (key: string) => string;
}) {
  const [filters, setFilters] = useState<ActivityFilterState>(INITIAL_FILTERS);
  const feed = useActivityFeed({ filters, fixedAgentId: agentId });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <ActivityFilterBar
        agents={[]}
        filters={filters}
        hideAgentFilter
        onChange={setFilters}
        t={t}
      />
      <ActivityFeed
        agentNameById={new Map([[agentId, agentName]])}
        groups={feed.groups}
        isError={feed.isError}
        isLoading={feed.isLoading}
      />
    </div>
  );
}
