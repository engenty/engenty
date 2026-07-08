import { isSameDay, parseISO } from "date-fns";
import type { CSSProperties } from "react";
import { isLinkableEntityId } from "../tracking-entity-link.js";
import type { TimeEntry, TrackingRow } from "../types.js";

/** Snap resolution for all calendar interactions. */
export const SNAP_MIN = 15;
/** Pixel height of one hour in the time grid. */
export const HOUR_PX = 48;
/** Pixel height of one snap slot. */
export const SLOT_PX = (HOUR_PX * SNAP_MIN) / 60;
/** Width of the hour-label gutter (Tailwind w-12). */
export const GUTTER_PX = 48;
/** Full grid height (24h). */
export const GRID_PX = 24 * HOUR_PX;
/** Default scroll position: start of the working day (~08:00–20:00 visible). */
export const DAY_START_HOUR = 8;
/** Width of the collapsed weekend column in the work-week view. */
export const WEEKEND_COL_PX = 32;
/** Minimum entry duration in minutes. */
export const MIN_DURATION = SNAP_MIN;

export function clampMinutes(min: number) {
  return Math.max(0, Math.min(24 * 60, min));
}

export function snapFloor(min: number) {
  return Math.floor(min / SNAP_MIN) * SNAP_MIN;
}

export function snapRound(min: number) {
  return Math.round(min / SNAP_MIN) * SNAP_MIN;
}

/** "HH:MM" → minutes since midnight, or null when unset/invalid. */
export function timeToMinutes(time: string | null | undefined): number | null {
  if (!time) {
    return null;
  }
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Minutes since midnight → "HH:MM". */
export function minutesToTime(min: number) {
  const clamped = clampMinutes(min);
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function entryStartMin(entry: TimeEntry): number | null {
  return timeToMinutes(entry.start_time);
}

export function entryDurationMin(entry: TimeEntry) {
  return Math.max(MIN_DURATION, Math.round(Number(entry.hours) * 60));
}

/** "7:30" style duration label for a block. */
export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}:${String(m).padStart(2, "0")}h`;
}

/** Same rounding as the table view sums. */
export function formatHours(hours: number) {
  return `${hours.toFixed(1)}h`;
}

// ---------------------------------------------------------------------------
// Brand colors — deterministic project → chart-token mapping
// ---------------------------------------------------------------------------

const CHART_VARS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    // Keep the running hash within Number.MAX_SAFE_INTEGER; only used
    // mod CHART_VARS.length below, so this coarser wrap is fine.
    hash = (hash * 31 + value.charCodeAt(i)) % 2 ** 31;
  }
  return Math.abs(hash);
}

/**
 * Stable key identifying the project a row/entry belongs to. Grouping
 * sentinels (e.g. project_id "standalone_tasks") are ignored so assignment
 * rows and their persisted timesheet rows land in the same group.
 */
export function projectColorKey(input: {
  manual_project_title?: string | null;
  manual_task_title?: string | null;
  project_id?: string | null;
  project_title?: string;
}) {
  return (
    (isLinkableEntityId(input.project_id) ? input.project_id : null) ??
    input.manual_project_title ??
    input.project_title ??
    input.manual_task_title ??
    "general"
  );
}

/** Color key for an entry — via its row when loaded, else its own fields. */
export function entryColorKey(entry: TimeEntry, rows: TrackingRow[]) {
  const row = rows.find((r) => r.id === entry.timesheet_row_id);
  if (row) {
    return projectColorKey(row);
  }
  return projectColorKey({
    manual_project_title: entry.manual_project_title,
    manual_task_title: entry.manual_task_title,
    project_id: entry.project_id,
  });
}

/** Brand chart-token color for a project key. */
export function projectColor(key: string) {
  return CHART_VARS[hashString(key) % CHART_VARS.length];
}

/** Tinted surface + accent styles for an entry block. */
export function blockColorStyle(color: string): CSSProperties {
  return {
    backgroundColor: `color-mix(in oklch, ${color} 30%, var(--card))`,
    borderColor: `color-mix(in oklch, ${color} 65%, transparent)`,
    // Consumers use this for the accent bar / dot.
    ["--entry-color" as string]: color,
  };
}

// ---------------------------------------------------------------------------
// Entry helpers
// ---------------------------------------------------------------------------

export function entriesForDay(entries: TimeEntry[], day: Date) {
  return entries.filter((entry) => isSameDay(parseISO(entry.date), day));
}

export function entryLabel(
  entry: TimeEntry,
  rows: TrackingRow[]
): { title: string; subtitle: string | null } {
  const row = rows.find((r) => r.id === entry.timesheet_row_id);
  if (row) {
    if (row.type === "task" && row.task_title) {
      return { title: row.task_title, subtitle: row.project_title };
    }
    if (row.type === "phase" && row.phase_title) {
      return { title: row.phase_title, subtitle: row.project_title };
    }
    return { title: row.project_title, subtitle: row.client_name };
  }
  const title =
    entry.manual_task_title ??
    entry.manual_phase_title ??
    entry.manual_project_title ??
    "—";
  const subtitle =
    entry.manual_task_title || entry.manual_phase_title
      ? (entry.manual_project_title ?? null)
      : null;
  return { title, subtitle };
}

// ---------------------------------------------------------------------------
// Overlap layout — assign lanes to concurrent blocks (interval partitioning)
// ---------------------------------------------------------------------------

export interface PositionedBlock {
  endMin: number;
  entry: TimeEntry;
  lane: number;
  lanes: number;
  startMin: number;
}

export function layoutDayBlocks(entries: TimeEntry[]): PositionedBlock[] {
  const timed = entries
    .map((entry) => {
      const startMin = entryStartMin(entry);
      if (startMin == null) {
        return null;
      }
      return {
        entry,
        startMin,
        endMin: Math.min(24 * 60, startMin + entryDurationMin(entry)),
        lane: 0,
        lanes: 1,
      };
    })
    .filter((block): block is PositionedBlock => block !== null)
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  // Cluster overlapping blocks, then assign the first free lane per block.
  let cluster: PositionedBlock[] = [];
  let clusterEnd = -1;
  const laneEnds: number[] = [];

  const finishCluster = () => {
    for (const block of cluster) {
      block.lanes = laneEnds.length;
    }
    cluster = [];
    laneEnds.length = 0;
  };

  for (const block of timed) {
    if (cluster.length > 0 && block.startMin >= clusterEnd) {
      finishCluster();
    }
    let lane = laneEnds.findIndex((end) => end <= block.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(block.endMin);
    } else {
      laneEnds[lane] = block.endMin;
    }
    block.lane = lane;
    cluster.push(block);
    clusterEnd = Math.max(clusterEnd, block.endMin);
  }
  finishCluster();

  return timed;
}
