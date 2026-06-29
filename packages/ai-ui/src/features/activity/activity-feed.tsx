// Presentational day-grouped activity feed (ui-6 §5). Reused by the global
// activity page and the agent-detail Activity tab (fixed agent filter).

import { useTranslation } from "@engenty/i18n/ui";
import { useNavigate } from "react-router-dom";
import { buildAgentSessionDetailPath } from "../agents-workspace/agent-workspace-paths";
import {
  type ActivityDayGroup,
  formatActivityDayLabel,
} from "./activity-day-groups";
import type { ActivityEntry } from "./activity-entries";
import { ActivityFeedItem } from "./activity-feed-item";

interface ActivityFeedProps {
  agentNameById: Map<string, string>;
  groups: ActivityDayGroup[];
  isError: boolean;
  isLoading: boolean;
}

export function ActivityFeed({
  agentNameById,
  groups,
  isError,
  isLoading,
}: ActivityFeedProps) {
  const { t } = useTranslation("ai-ui");
  const navigate = useNavigate();

  const handleSelect = (entry: ActivityEntry) => {
    if (!entry.agentId) {
      return;
    }
    navigate(buildAgentSessionDetailPath(entry.agentId, entry.entityId));
  };

  if (isLoading) {
    return (
      <p className="text-muted-foreground text-sm">{t("activity.loading")}</p>
    );
  }
  if (isError) {
    return <p className="text-destructive text-sm">{t("activity.error")}</p>;
  }
  if (groups.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">{t("activity.empty")}</p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      {groups.map((group) => (
        <section key={group.dayKey}>
          <h3 className="px-1 pb-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
            {formatActivityDayLabel(group, t)}
          </h3>
          <div className="overflow-hidden rounded-lg border bg-background">
            {group.entries.map((entry) => (
              <ActivityFeedItem
                agentName={
                  entry.agentId
                    ? (agentNameById.get(entry.agentId) ?? null)
                    : null
                }
                entry={entry}
                key={entry.key}
                onSelect={handleSelect}
                t={t}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
