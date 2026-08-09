// Context-window usage for a chat thread: how much of the model's window the
// last measured run's prompt consumed, plus what that prompt cost.
//
// The numbers come from `ai.agent_run` (prompt/completion tokens, recorded per
// run) joined to `ai.model` (window size, per-Mtok prices). Nothing here
// estimates: if the server did not report a figure, the corresponding field is
// null and the UI omits it rather than guessing.

export interface ThreadContextUsage {
  completion_tokens: number | null;
  context_tokens: number | null;
  /** Wall-clock of the run; null while it is still open. */
  duration_ms: number | null;
  finished_at: string | null;
  input_per_mtok_micros: number | null;
  model_display_name: string | null;
  model_id: string | null;
  output_per_mtok_micros: number | null;
  prompt_tokens: number;
  run_id: string;
  started_at: string;
  status: string;
}

/**
 * Tokens the run actually moved: prompt + completion.
 *
 * NOT the same as the context figure. `prompt_tokens` alone is what filled the
 * window; this adds what the model wrote back, which is what the run is billed
 * on and what "tokens used" means to a reader.
 */
export function runTokenTotal(usage: ThreadContextUsage): number {
  return usage.prompt_tokens + (usage.completion_tokens ?? 0);
}

/** `18s`, `1m 04s`, `2h 11m`. Null duration renders as `—`. */
export function formatRunDuration(durationMs: number | null): string {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs < 0) {
    return "—";
  }
  const totalSeconds = Math.round(durationMs / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** Fraction of the window in use, or null when the window is unknown. */
export function contextUsageRatio(usage: ThreadContextUsage): number | null {
  const window = usage.context_tokens;
  if (window == null || window <= 0) {
    return null;
  }
  // A prompt can exceed a stale catalog window; clamping keeps the bar inside
  // its track without hiding the real percentage in the label.
  return Math.max(0, usage.prompt_tokens / window);
}

/**
 * Compact token count: `159.3k`, `1.0M`, `847`.
 *
 * One decimal, not the whole-unit rounding used by the model catalog's static
 * chips — this figure moves every turn, and `159k → 160k` reads as noise while
 * `159.3k → 162.8k` reads as growth.
 */
export function formatTokenCount(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens < 0) {
    return "0";
  }
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return String(Math.round(tokens));
}

/** `159.3k / 240.0k (66%)`, or just `159.3k` when the window is unknown. */
export function formatContextUsageLabel(usage: ThreadContextUsage): string {
  const used = formatTokenCount(usage.prompt_tokens);
  const ratio = contextUsageRatio(usage);
  if (ratio == null || usage.context_tokens == null) {
    return used;
  }
  return `${used} / ${formatTokenCount(usage.context_tokens)} (${Math.round(
    ratio * 100
  )}%)`;
}

/**
 * USD cost of the last measured run, or null when the catalog carries no price
 * for the model. Prices are micros per million tokens, so the divisor is
 * 1e6 (micros → USD) × 1e6 (per-Mtok → per-token).
 *
 * This is ONE run, not the thread total: `ai.agent_run` stores per-run usage
 * and a thread sum would need every run rolled up. Label it as such wherever
 * it is shown — a per-run figure presented as a thread total is a wrong number,
 * not an imprecise one.
 */
export function contextUsageCostUsd(usage: ThreadContextUsage): number | null {
  const inputRate = usage.input_per_mtok_micros;
  const outputRate = usage.output_per_mtok_micros;
  if (inputRate == null && outputRate == null) {
    return null;
  }
  const inputCost = ((inputRate ?? 0) * usage.prompt_tokens) / 1e12;
  const outputCost =
    ((outputRate ?? 0) * (usage.completion_tokens ?? 0)) / 1e12;
  return inputCost + outputCost;
}

/** `$0.0421`, or `<$0.0001` for a non-zero cost that would round to nothing. */
export function formatCostUsd(costUsd: number): string {
  if (costUsd > 0 && costUsd < 0.0001) {
    return "<$0.0001";
  }
  return `$${costUsd.toFixed(4)}`;
}

export type ContextUsageLevel = "normal" | "high" | "critical";

/**
 * Severity for the bar colour. The thresholds are about headroom, not
 * aesthetics: past ~75% a long tool result can overflow the window mid-turn,
 * and past ~90% the next turn probably will.
 */
export function contextUsageLevel(
  usage: ThreadContextUsage
): ContextUsageLevel {
  const ratio = contextUsageRatio(usage);
  if (ratio == null) {
    return "normal";
  }
  if (ratio >= 0.9) {
    return "critical";
  }
  if (ratio >= 0.75) {
    return "high";
  }
  return "normal";
}
