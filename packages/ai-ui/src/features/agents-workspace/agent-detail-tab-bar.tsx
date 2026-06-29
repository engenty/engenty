// Tab strip for the agent detail "personnel file" (ui-6 §3).

import { HorizontalScrollFade, TabsList, TabsTrigger } from "@engenty/ui-core";
import { AgentDetailTabLabel } from "./agent-detail-tab-labels";
import type { AgentDetailTab } from "./agent-detail-tabs";

const TAB_LABEL_KEYS: Record<AgentDetailTab, string> = {
  activity: "agentDetail.tabs.activity",
  capabilities: "agentDetail.tabs.capabilities",
  instructions: "agentDetail.tabs.instructions",
  workspace: "agentDetail.tabs.workspace",
  overview: "agentDetail.tabs.overview",
};

export interface AgentDetailTabBadge {
  count?: number;
  showSpinner?: boolean;
}

interface AgentDetailTabBarProps {
  badges: Partial<Record<AgentDetailTab, AgentDetailTabBadge>>;
  t: (key: string) => string;
  tabs: AgentDetailTab[];
}

export function AgentDetailTabBar({ badges, t, tabs }: AgentDetailTabBarProps) {
  return (
    <HorizontalScrollFade
      className="-mx-4 min-w-0 shrink-0 md:-mx-5"
      fadeFromClassName="from-card"
      scrollClassName="px-4 md:px-5"
    >
      <TabsList
        className="-mb-px inline-flex h-10 w-max min-w-0 flex-nowrap justify-start rounded-none border-0 bg-transparent p-0"
        variant="line"
      >
        {tabs.map((tab) => {
          const badge = badges[tab];
          const label = t(TAB_LABEL_KEYS[tab]);
          return (
            <TabsTrigger
              className="max-w-[min(100%,14rem)] flex-none"
              key={tab}
              value={tab}
            >
              {badge ? (
                <AgentDetailTabLabel
                  count={badge.count ?? 0}
                  label={label}
                  showSpinner={badge.showSpinner}
                />
              ) : (
                label
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </HorizontalScrollFade>
  );
}
