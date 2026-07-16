// Grouped feed view for the activity list page: collapsible group headers
// (day / agent / status) over the classic bordered feed rows. The simpler
// ungrouped ActivityFeed stays in use on the agent-detail tab.

import { useTranslation } from "@engenty/i18n/ui";
import { AdminListGroupHeader, AdminListGroupPill } from "@engenty/ui-core";
import { Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { buildAgentSessionDetailPath } from "../agents-workspace/agent-workspace-paths";
import type { ActivityEntry } from "./activity-entries";
import { ActivityFeedItem } from "./activity-feed-item";
import { resolveActivityGroupHeader } from "./activity-list-display";
import type { ActivityGroupBy, ActivityListGroup } from "./activity-list-state";

interface ActivityListFeedProps {
  agentNameById: Map<string, string>;
  groupBy: ActivityGroupBy;
  groups: ActivityListGroup[];
  isGroupOpen: (id: string) => boolean;
  onToggleGroup: (id: string) => void;
}

export function ActivityListFeed({
  agentNameById,
  groupBy,
  groups,
  isGroupOpen,
  onToggleGroup,
}: ActivityListFeedProps) {
  const { t } = useTranslation("ai-ui");
  const navigate = useNavigate();
  const grouped = groupBy !== "none";

  const groupCountLabel = (count: number) =>
    `${count} ${
      count === 1
        ? t("activity.groupCountSingular")
        : t("activity.groupCountPlural")
    }`;

  const handleSelect = (entry: ActivityEntry) => {
    if (!entry.agentId) {
      return;
    }
    navigate(buildAgentSessionDetailPath(entry.agentId, entry.entityId));
  };

  return (
    <div className="flex flex-col gap-2">
      {groups.map((group) => {
        const open = grouped ? isGroupOpen(group.id) : true;
        const header = resolveActivityGroupHeader(
          t,
          groupBy,
          group,
          agentNameById
        );
        return (
          <Fragment key={group.id}>
            {grouped ? (
              <AdminListGroupHeader
                count={groupCountLabel(group.entries.length)}
                onToggle={() => onToggleGroup(group.id)}
                open={open}
                toggleLabel={t("activity.toggleGroup")}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <header.Icon
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <AdminListGroupPill>{header.label}</AdminListGroupPill>
                </span>
              </AdminListGroupHeader>
            ) : null}
            {open ? (
              <div className="mb-2 overflow-hidden rounded-lg border bg-background">
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
            ) : null}
          </Fragment>
        );
      })}
    </div>
  );
}
