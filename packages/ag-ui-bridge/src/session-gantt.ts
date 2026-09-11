import { ganttLaneFor, type TrajectoryGanttLane } from "./run-trace-gantt.js";
import type { TrajectoryCellKind, TrajectoryRow } from "./trajectory.js";

const MIN_BAND_MS = 1000;

export interface SessionTurnNode<T> {
  children: SessionTurnNode<T>[];
  run: T;
}

export function nestSessionTurns<
  T extends { id: string; parent_run_id?: string | null },
>(runs: readonly T[], children: readonly T[]): SessionTurnNode<T>[] {
  const byParent = new Map<string, T[]>();
  for (const child of children) {
    const parentId = child.parent_run_id;
    if (!parentId) {
      continue;
    }
    const list = byParent.get(parentId) ?? [];
    list.push(child);
    byParent.set(parentId, list);
  }
  return runs.map((run) => ({
    children: (byParent.get(run.id) ?? []).map((child) => ({
      children: [] as SessionTurnNode<T>[],
      run: child,
    })),
    run,
  }));
}

export interface SessionTurnInput {
  children?: readonly SessionTurnInput[];
  rows: readonly TrajectoryRow[];
  run: {
    finished_at: string | null;
    id: string;
    started_at: string | null;
  };
}

export interface SessionGanttSpan {
  endMs: number;
  ghost: boolean;
  id: string;
  keyLabel: string | null;
  kind: TrajectoryCellKind;
  label: string;
  lane: TrajectoryGanttLane;
  runId: string;
  sourceMessageId: string | null;
  sourceRunId: string | null;
  startMs: number;
}

export interface SessionGanttBand {
  children: SessionGanttBand[];
  endMs: number;
  runId: string;
  spans: readonly SessionGanttSpan[];
  startMs: number;
}

export interface SessionGanttModel {
  bands: readonly SessionGanttBand[];
  endMs: number;
  startMs: number;
}

function parseTime(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function bandRange(
  run: SessionTurnInput["run"],
  nowMs: number
): { endMs: number; startMs: number } {
  const startMs = parseTime(run.started_at) ?? nowMs;
  const endMs = parseTime(run.finished_at) ?? nowMs;
  if (endMs - startMs >= MIN_BAND_MS) {
    return { endMs, startMs };
  }
  return { endMs: startMs + MIN_BAND_MS, startMs };
}

function liveMessageIndex(
  turns: readonly SessionTurnInput[]
): Map<string, string> {
  const index = new Map<string, string>();
  const visit = (turn: SessionTurnInput) => {
    for (const row of turn.rows) {
      if (row.kind === "history" || !row.sourceMessageId) {
        continue;
      }
      if (!index.has(row.sourceMessageId)) {
        index.set(row.sourceMessageId, turn.run.id);
      }
    }
    for (const child of turn.children ?? []) {
      visit(child);
    }
  };
  for (const turn of turns) {
    visit(turn);
  }
  return index;
}

function scaleRows(input: {
  endMs: number;
  liveMessages: Map<string, string>;
  rows: readonly TrajectoryRow[];
  runId: string;
  startMs: number;
}): SessionGanttSpan[] {
  const count = Math.max(input.rows.length, 1);
  const width = Math.max(input.endMs - input.startMs, MIN_BAND_MS);
  const slot = width / count;
  return input.rows.map((row, index) => {
    const ghost = row.kind === "history";
    const sourceRunId =
      ghost && row.sourceMessageId
        ? (input.liveMessages.get(row.sourceMessageId) ?? null)
        : null;
    return {
      endMs: input.startMs + (index + 1) * slot,
      ghost,
      id: row.id,
      keyLabel: row.keyLabel,
      kind: row.kind,
      label: row.text,
      lane: ganttLaneFor(row),
      runId: input.runId,
      sourceMessageId: row.sourceMessageId,
      sourceRunId:
        sourceRunId && sourceRunId !== input.runId ? sourceRunId : null,
      startMs: input.startMs + index * slot,
    };
  });
}

function toBand(
  turn: SessionTurnInput,
  liveMessages: Map<string, string>,
  nowMs: number
): SessionGanttBand {
  const range = bandRange(turn.run, nowMs);
  return {
    children: (turn.children ?? []).map((child) =>
      toBand(child, liveMessages, nowMs)
    ),
    endMs: range.endMs,
    runId: turn.run.id,
    spans: scaleRows({
      endMs: range.endMs,
      liveMessages,
      rows: turn.rows,
      runId: turn.run.id,
      startMs: range.startMs,
    }),
    startMs: range.startMs,
  };
}

/**
 * Wall-clock session waterfall: one band per turn, four lanes packed into the
 * run's `[started_at, finished_at]`. History rows are ghosts; a recalled
 * pointer that matches a live user/assistant message in an earlier turn
 * carries `sourceRunId` so the UI can jump there.
 */
export function deriveSessionGantt(
  turns: readonly SessionTurnInput[],
  nowMs = Date.now()
): SessionGanttModel | null {
  if (turns.length === 0) {
    return null;
  }
  const liveMessages = liveMessageIndex(turns);
  const bands = turns.map((turn) => toBand(turn, liveMessages, nowMs));
  let startMs = Number.POSITIVE_INFINITY;
  let endMs = Number.NEGATIVE_INFINITY;
  const visit = (band: SessionGanttBand) => {
    startMs = Math.min(startMs, band.startMs);
    endMs = Math.max(endMs, band.endMs);
    for (const child of band.children) {
      visit(child);
    }
  };
  for (const band of bands) {
    visit(band);
  }
  if (!(Number.isFinite(startMs) && Number.isFinite(endMs))) {
    return null;
  }
  return { bands, endMs, startMs };
}
