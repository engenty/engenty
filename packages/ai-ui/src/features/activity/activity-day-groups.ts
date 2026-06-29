// Day grouping (Today / Yesterday / date headers) for the activity feed.

import type { ActivityEntry } from "./activity-entries";

export interface ActivityDayGroup {
  /** Local-date key, e.g. "2026-06-12". */
  dayKey: string;
  entries: ActivityEntry[];
  kind: "today" | "yesterday" | "date";
  timestamp: string;
}

const DAY_MS = 86_400_000;

function localDayKey(date: Date) {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Expects entries already sorted newest-first; preserves order within groups. */
export function groupActivityEntriesByDay(
  entries: ActivityEntry[],
  now: Date = new Date()
): ActivityDayGroup[] {
  const todayKey = localDayKey(now);
  const yesterdayKey = localDayKey(new Date(now.getTime() - DAY_MS));
  const groups: ActivityDayGroup[] = [];
  for (const entry of entries) {
    const dayKey = localDayKey(new Date(entry.timestamp));
    const current = groups.at(-1);
    if (current && current.dayKey === dayKey) {
      current.entries.push(entry);
      continue;
    }
    const kind =
      dayKey === todayKey
        ? "today"
        : dayKey === yesterdayKey
          ? "yesterday"
          : "date";
    groups.push({ dayKey, entries: [entry], kind, timestamp: entry.timestamp });
  }
  return groups;
}

export function formatActivityDayLabel(
  group: ActivityDayGroup,
  t: (key: string) => string
): string {
  if (group.kind === "today") {
    return t("activity.today");
  }
  if (group.kind === "yesterday") {
    return t("activity.yesterday");
  }
  const date = new Date(group.timestamp);
  if (Number.isNaN(date.getTime())) {
    return group.dayKey;
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(date);
}
