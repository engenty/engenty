import { isSameDay, parseISO } from "date-fns";
import { useMemo } from "react";
import type { TimeEntry, TrackingRow } from "../types.js";
import {
  formatHours,
  projectColor,
  projectColorKey,
} from "./calendar-utils.js";

interface TimelineBar {
  colorKey: string;
  endIndex: number;
  plannedHours: number;
  startIndex: number;
  subtitle: string;
  title: string;
  trackedHours: number;
}

interface CalendarTimelineProps {
  days: Date[];
  entries: TimeEntry[];
  trackingRows: TrackingRow[];
}

/**
 * "All-day" style lane above the grid: one bar per project, spanning the days
 * that have tracked time (full range when only planned), with tracked/planned
 * totals — the calendar counterpart of the table's project groups.
 */
export function CalendarTimeline({
  days,
  entries,
  trackingRows,
}: CalendarTimelineProps) {
  const bars = useMemo((): TimelineBar[] => {
    const groups = new Map<
      string,
      { rows: TrackingRow[]; subtitle: string; title: string }
    >();
    for (const row of trackingRows) {
      const key = projectColorKey(row);
      const group = groups.get(key);
      if (group) {
        group.rows.push(row);
      } else {
        groups.set(key, {
          rows: [row],
          subtitle: row.client_name,
          title: row.project_title,
        });
      }
    }

    const result: TimelineBar[] = [];
    for (const [key, group] of groups) {
      const rowIds = new Set(group.rows.map((row) => row.id));
      const groupEntries = entries.filter((entry) =>
        rowIds.has(entry.timesheet_row_id)
      );
      const dayFlags = days.map((day) =>
        groupEntries.some((entry) => isSameDay(parseISO(entry.date), day))
      );
      const first = dayFlags.indexOf(true);
      const last = dayFlags.lastIndexOf(true);
      const trackedHours = groupEntries.reduce(
        (sum, entry) => sum + Number(entry.hours),
        0
      );
      const plannedHours = group.rows.reduce(
        (sum, row) => sum + Number(row.planned_hours || 0),
        0
      );
      if (first === -1 && plannedHours <= 0) {
        continue;
      }
      result.push({
        colorKey: key,
        endIndex: last === -1 ? days.length - 1 : last,
        plannedHours,
        startIndex: first === -1 ? 0 : first,
        subtitle: group.subtitle,
        title: group.title,
        trackedHours,
      });
    }
    return result.sort(
      (a, b) =>
        a.startIndex - b.startIndex || a.title.localeCompare(b.title)
    );
  }, [days, entries, trackingRows]);

  if (bars.length === 0) {
    return null;
  }

  return (
    <div className="max-h-[104px] overflow-y-auto border-b">
      <div
        className="grid gap-y-1 py-1.5"
        style={{
          gridTemplateColumns: `48px repeat(${days.length}, minmax(0, 1fr))`,
        }}
      >
        {bars.map((bar) => {
          const color = projectColor(bar.colorKey);
          const dashed = bar.trackedHours <= 0;
          return (
            <div
              className={[
                "mx-0.5 flex h-6 min-w-0 items-center gap-1.5 rounded-full border px-2",
                dashed ? "border-dashed" : "border-transparent",
              ].join(" ")}
              key={bar.colorKey}
              style={{
                backgroundColor: dashed
                  ? "transparent"
                  : `color-mix(in oklch, ${color} 14%, var(--card))`,
                borderColor: dashed
                  ? `color-mix(in oklch, ${color} 45%, transparent)`
                  : undefined,
                gridColumn: `${bar.startIndex + 2} / ${bar.endIndex + 3}`,
              }}
              title={`${bar.subtitle} / ${bar.title}`}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="truncate font-medium text-foreground text-xs">
                {bar.title}
              </span>
              <span className="ml-auto shrink-0 text-[10px] text-muted-foreground tabular-nums">
                {formatHours(bar.trackedHours)}
                {bar.plannedHours > 0
                  ? ` / ${formatHours(bar.plannedHours)}`
                  : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
