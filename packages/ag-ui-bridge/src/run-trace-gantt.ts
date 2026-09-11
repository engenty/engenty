import type { TrajectoryCellKind, TrajectoryRow } from "./trajectory.js";

/** System / User / Model / Tools — history follows the recalled role. */
export type TrajectoryGanttLane = 0 | 1 | 2 | 3;

export const GANTT_LANE_COUNT = 4;
export const GANTT_LANE_PITCH_PX = 14;
export const GANTT_LANE_PAD_PX = 7;
/** Room above the lanes for HISTORY / TURN n labels. */
export const GANTT_LABEL_ROW_PX = 12;

export interface TrajectoryGanttSpan {
  end: number;
  id: string;
  keyLabel: string | null;
  kind: TrajectoryCellKind;
  label: string;
  lane: TrajectoryGanttLane;
  start: number;
}

export interface TrajectoryGanttTurnBoundary {
  time: number;
  turn: number;
}

export interface TrajectoryGanttSectionLabel {
  label: string;
  time: number;
}

export interface TrajectoryGanttModel {
  end: number;
  sectionLabels: readonly TrajectoryGanttSectionLabel[];
  spans: readonly TrajectoryGanttSpan[];
  start: number;
  turnBoundaries: readonly TrajectoryGanttTurnBoundary[];
}

export function ganttLaneFor(row: {
  keyLabel?: string | null;
  kind: TrajectoryCellKind;
}): TrajectoryGanttLane {
  const role = row.kind === "history" ? row.keyLabel : row.kind;
  switch (role) {
    case "user":
    case "human":
    case "agent":
      return 1;
    case "assistant":
      return 2;
    case "tool":
      return 3;
    default:
      return 0;
  }
}

export function trajectoryRowAnchorId(rowId: string): string {
  return `trajectory-row-${rowId}`;
}

/**
 * Equal-width sequence projection: one slot per ledger row. Timing is not on
 * the AG-UI wire, so this is the overview that always has something to draw.
 */
export function deriveTrajectoryGantt(
  rows: readonly TrajectoryRow[]
): TrajectoryGanttModel | null {
  if (rows.length === 0) {
    return null;
  }
  const spans: TrajectoryGanttSpan[] = rows.map((row, index) => ({
    end: index + 1,
    id: row.id,
    keyLabel: row.keyLabel,
    kind: row.kind,
    label: row.text,
    lane: ganttLaneFor(row),
    start: index,
  }));
  const turnBoundaries: TrajectoryGanttTurnBoundary[] = [];
  const sectionLabels: TrajectoryGanttSectionLabel[] = [];
  const historyIndex = rows.findIndex((row) => row.kind === "history");
  if (historyIndex >= 0) {
    sectionLabels.push({ label: "HISTORY", time: historyIndex });
  }
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.turnStart && row.turn != null) {
      turnBoundaries.push({ time: index, turn: row.turn });
      sectionLabels.push({ label: `TURN ${row.turn}`, time: index });
    }
  }
  return {
    end: rows.length,
    sectionLabels,
    spans,
    start: 0,
    turnBoundaries,
  };
}
