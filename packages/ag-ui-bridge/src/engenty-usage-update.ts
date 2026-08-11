/**
 * CUSTOM AG-UI event: token usage for the run SO FAR.
 *
 * Emitted once per model step, carrying the run's cumulative totals — the same
 * numbers that get metered when the run ends. Without it the composer's usage
 * line can only show what the last FINISHED run cost, so a long turn sits on a
 * stale figure exactly while the interesting one is moving.
 *
 * Cumulative, not per-step: a dropped or replayed event must not corrupt the
 * count, and a client that joins mid-run gets the true total from the next step
 * rather than a partial sum.
 */
export const ENGENTY_USAGE_UPDATE_EVENT = "engenty.usage.update";

export interface EngentyUsageUpdatePayload {
  /** Cache-read slice of `input_tokens`, never an addition to it. */
  cached_tokens: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
}

/** Tokens the run has moved so far: input + output. Slices are NOT added. */
export function sumEngentyUsageUpdateTokens(
  payload: EngentyUsageUpdatePayload
): number {
  return payload.input_tokens + payload.output_tokens;
}

function readCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

export function readEngentyUsageUpdateEventValue(
  value: unknown
): EngentyUsageUpdatePayload | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const payload: EngentyUsageUpdatePayload = {
    cached_tokens: readCount(record.cached_tokens),
    input_tokens: readCount(record.input_tokens),
    output_tokens: readCount(record.output_tokens),
    reasoning_tokens: readCount(record.reasoning_tokens),
  };
  // An all-zero payload carries nothing a reader can act on, and treating it as
  // real would blank a live counter mid-run.
  if (payload.input_tokens === 0 && payload.output_tokens === 0) {
    return null;
  }
  return payload;
}
