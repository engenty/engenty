// Shared presentation helpers for the activity list page — group-header
// icon/label per grouping facet, so the feed and table views stay in sync.

import {
  Bot,
  CalendarDays,
  CircleAlert,
  CircleCheckBig,
  CircleDot,
  ListChecks,
} from "lucide-react";
import type { ComponentType } from "react";
import { formatActivityDayLabel } from "./activity-day-groups";
import {
  ACTIVITY_NO_AGENT_ID,
  type ActivityGroupBy,
  type ActivityListGroup,
} from "./activity-list-state";

export type IconType = ComponentType<{
  "aria-hidden"?: boolean;
  className?: string;
}>;

type Translate = (key: string) => string;

const STATUS_ICON: Record<string, IconType> = {
  failed: CircleAlert,
  finished: CircleCheckBig,
  running: CircleDot,
};

/** Truncate an id for display without losing the recognisable prefix. */
export function shortActivityId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

export function activityStatusLabel(t: Translate, statusKind: string): string {
  const key = `activity.status_${statusKind}`;
  const value = t(key);
  return value === key ? statusKind : value;
}

export interface ActivityGroupHeader {
  Icon: IconType;
  label: string;
}

/** Icon + label for a group header, keyed by the active grouping. */
export function resolveActivityGroupHeader(
  t: Translate,
  groupBy: ActivityGroupBy,
  group: ActivityListGroup,
  agentNameById: ReadonlyMap<string, string>
): ActivityGroupHeader {
  switch (groupBy) {
    case "day":
      return {
        Icon: CalendarDays,
        label: group.day
          ? formatActivityDayLabel(
              { ...group.day, dayKey: group.id, entries: group.entries },
              t
            )
          : group.id,
      };
    case "agent":
      return {
        Icon: Bot,
        label:
          group.id === ACTIVITY_NO_AGENT_ID
            ? t("activity.noAgent")
            : (agentNameById.get(group.id) ?? group.id),
      };
    case "status":
      return {
        Icon: STATUS_ICON[group.id] ?? CircleDot,
        label: activityStatusLabel(t, group.id),
      };
    default:
      return { Icon: ListChecks, label: t("activity.title") };
  }
}
