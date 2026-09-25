import { REACT_TRANSITION_EXPIRATION_MS } from "./interaction-budgets";

export type InteractionMode = "development" | "production";

export interface LongTaskSample {
  duration: number;
  startTime: number;
}

export interface CompletedInteraction {
  apiCompleteMs: number | null;
  apiCount: number;
  firstPaintMs: number | null;
  longTaskMaxMs: number;
  longTasks: LongTaskSample[];
  mode: InteractionMode;
  name: string;
  /** Click (or begin) → URL update. Interaction-response budget. */
  responseMs: number | null;
  starvedByReactExpiration: boolean;
}

export interface InteractionSession {
  begin: (name: string) => void;
  end: () => CompletedInteraction | null;
  isActive: () => boolean;
  markApi: (durationMs: number) => void;
  markLongTask: (task: LongTaskSample) => void;
  markPaint: () => void;
  markUrl: () => void;
  records: CompletedInteraction[];
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[rank] ?? 0;
}

export function createInteractionSession(input: {
  mode: InteractionMode;
  now: () => number;
}): InteractionSession {
  const records: CompletedInteraction[] = [];
  let current: {
    apiCount: number;
    apiMaxMs: number;
    longTasks: LongTaskSample[];
    name: string;
    paintAt: number | null;
    startedAt: number;
    urlAt: number | null;
  } | null = null;

  function close(): CompletedInteraction | null {
    if (!current) {
      return null;
    }
    const responseMs =
      current.urlAt === null ? null : current.urlAt - current.startedAt;
    const firstPaintMs =
      current.paintAt === null ? null : current.paintAt - current.startedAt;
    const longTaskMaxMs = current.longTasks.reduce(
      (max, task) => Math.max(max, task.duration),
      0
    );
    const completed: CompletedInteraction = {
      apiCompleteMs: current.apiCount === 0 ? null : current.apiMaxMs,
      apiCount: current.apiCount,
      firstPaintMs,
      longTaskMaxMs,
      longTasks: current.longTasks,
      mode: input.mode,
      name: current.name,
      responseMs,
      starvedByReactExpiration:
        (responseMs ?? 0) >= REACT_TRANSITION_EXPIRATION_MS - 500,
    };
    records.push(completed);
    current = null;
    return completed;
  }

  return {
    records,
    begin(name) {
      if (current) {
        close();
      }
      current = {
        apiCount: 0,
        apiMaxMs: 0,
        longTasks: [],
        name,
        paintAt: null,
        startedAt: input.now(),
        urlAt: null,
      };
    },
    end: close,
    isActive: () => current !== null,
    markApi(durationMs) {
      if (!current) {
        return;
      }
      current.apiCount += 1;
      current.apiMaxMs = Math.max(current.apiMaxMs, durationMs);
    },
    markLongTask(task) {
      if (!current) {
        return;
      }
      if (task.startTime + 1 < current.startedAt) {
        return;
      }
      current.longTasks.push(task);
    },
    markPaint() {
      if (current && current.paintAt === null) {
        current.paintAt = input.now();
      }
    },
    markUrl() {
      if (current && current.urlAt === null) {
        current.urlAt = input.now();
      }
    },
  };
}
