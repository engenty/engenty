// Filter / sort / group logic for the full activity list page. Day is the
// default grouping (the audit-feed reading); agent, status and none are also
// selectable. The agent-detail tab keeps using the simpler activity-entries
// filter — this module only serves /admin/engenty/activity.

import {
  type ActivityDayGroup,
  groupActivityEntriesByDay,
} from "./activity-day-groups";
import type {
  ActivityEntry,
  ActivityFilterState,
  ActivityStatusKind,
} from "./activity-entries";
import { filterActivityEntries } from "./activity-entries";

export type ActivityGroupBy = "day" | "agent" | "status" | "none";
export type ActivitySortBy = "timestamp" | "title" | "agent";

/** Bucket id used for entries without an agent. */
export const ACTIVITY_NO_AGENT_ID = "__none__";

const STATUS_ORDER: readonly ActivityStatusKind[] = [
  "running",
  "failed",
  "finished",
  "other",
];

export interface ActivityListGroup {
  /** Day-grouping metadata for the header label (Today / Yesterday / date). */
  day?: Pick<ActivityDayGroup, "kind" | "timestamp">;
  entries: ActivityEntry[];
  id: string;
  rows?: never;
}

export interface ActivityListState extends ActivityFilterState {
  sortBy: ActivitySortBy;
  sortOrder: "asc" | "desc";
}

function agentName(
  entry: ActivityEntry,
  agentNameById: ReadonlyMap<string, string>
): string {
  return entry.agentId
    ? (agentNameById.get(entry.agentId) ?? entry.agentId)
    : "";
}

export function filterAndSortActivityEntries(
  entries: ActivityEntry[],
  state: ActivityListState,
  agentNameById: ReadonlyMap<string, string>
): ActivityEntry[] {
  const query = state.search.trim().toLowerCase();
  // Base filter handles agent/status/title/id; extend the search to agent names.
  const base = filterActivityEntries(entries, { ...state, search: "" });
  const filtered = query
    ? base.filter(
        (entry) =>
          (entry.title?.toLowerCase().includes(query) ?? false) ||
          entry.entityId.toLowerCase().includes(query) ||
          entry.userId.toLowerCase().includes(query) ||
          (entry.hostKey?.toLowerCase().includes(query) ?? false) ||
          agentName(entry, agentNameById).toLowerCase().includes(query)
      )
    : base;

  const direction = state.sortOrder === "asc" ? 1 : -1;
  return filtered.toSorted((left, right) => {
    if (state.sortBy === "timestamp") {
      return (
        (new Date(left.timestamp).getTime() -
          new Date(right.timestamp).getTime()) *
        direction
      );
    }
    const leftValue =
      state.sortBy === "agent"
        ? agentName(left, agentNameById)
        : (left.title ?? "");
    const rightValue =
      state.sortBy === "agent"
        ? agentName(right, agentNameById)
        : (right.title ?? "");
    return leftValue.localeCompare(rightValue) * direction;
  });
}

export function groupActivityList(
  entries: ActivityEntry[],
  groupBy: ActivityGroupBy,
  agentNameById: ReadonlyMap<string, string>
): ActivityListGroup[] {
  if (entries.length === 0) {
    return [];
  }
  if (groupBy === "none") {
    return [{ entries: [...entries], id: "all" }];
  }
  if (groupBy === "day") {
    return groupActivityEntriesByDay(entries).map((group) => ({
      day: { kind: group.kind, timestamp: group.timestamp },
      entries: group.entries,
      id: group.dayKey,
    }));
  }

  const buckets = new Map<string, ActivityEntry[]>();
  for (const entry of entries) {
    const key =
      groupBy === "agent"
        ? (entry.agentId ?? ACTIVITY_NO_AGENT_ID)
        : entry.statusKind;
    buckets.set(key, [...(buckets.get(key) ?? []), entry]);
  }

  const ids =
    groupBy === "status"
      ? [
          ...STATUS_ORDER.filter((id) => buckets.has(id)),
          ...[...buckets.keys()].filter(
            (id) => !STATUS_ORDER.includes(id as ActivityStatusKind)
          ),
        ]
      : [...buckets.keys()].toSorted((left, right) => {
          // Agents alphabetically by display name; the no-agent bucket last.
          if (left === ACTIVITY_NO_AGENT_ID) {
            return 1;
          }
          if (right === ACTIVITY_NO_AGENT_ID) {
            return -1;
          }
          return (agentNameById.get(left) ?? left).localeCompare(
            agentNameById.get(right) ?? right
          );
        });
  return ids.map((id) => ({ entries: buckets.get(id) ?? [], id }));
}
