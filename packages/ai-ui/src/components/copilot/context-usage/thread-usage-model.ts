// Aggregation for the thread-usage drill-in.
//
// One rule governs everything here: `cached_tokens` is the part of
// `input_tokens` that was served from the prompt cache, and `reasoning_tokens`
// is the part of `output_tokens` the model spent thinking. They are SLICES, not
// extra dimensions. Summing all four is how a thread that moved 98k tokens ends
// up reported as 172k.
import type { ThreadUsageEvent } from "./thread-usage-events-api.js";

export interface ThreadUsageSummary {
  cachedTokens: number;
  /** Metered runs, not raw model calls — see `largestRunInputTokens`. */
  callCount: number;
  costMicros: number;
  currency: string;
  freshInputTokens: number;
  inputTokens: number;
  /** Every model the thread has billed against, most-used first. */
  modelIds: string[];
  outputTokens: number;
  reasoningTokens: number;
  /** input + output. The tokens the thread actually moved. */
  totalTokens: number;
}

export function summarizeUsageEvents(
  events: readonly ThreadUsageEvent[]
): ThreadUsageSummary {
  const modelCounts = new Map<string, number>();
  const summary: ThreadUsageSummary = {
    cachedTokens: 0,
    callCount: events.length,
    costMicros: 0,
    currency: "usd",
    freshInputTokens: 0,
    inputTokens: 0,
    modelIds: [],
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
  };
  for (const event of events) {
    summary.inputTokens += event.input_tokens;
    summary.outputTokens += event.output_tokens;
    summary.cachedTokens += event.cached_tokens;
    summary.reasoningTokens += event.reasoning_tokens;
    summary.costMicros += event.cost_micros;
    if (event.currency) {
      summary.currency = event.currency;
    }
    modelCounts.set(event.model_id, (modelCounts.get(event.model_id) ?? 0) + 1);
  }
  summary.freshInputTokens = Math.max(
    0,
    summary.inputTokens - summary.cachedTokens
  );
  summary.totalTokens = summary.inputTokens + summary.outputTokens;
  summary.modelIds = [...modelCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([modelId]) => modelId);
  return summary;
}

/** Share of a thread's input that the provider served from cache (0…1). */
export function cacheHitRatio(summary: ThreadUsageSummary): number | null {
  if (summary.inputTokens <= 0) {
    return null;
  }
  return summary.cachedTokens / summary.inputTokens;
}

/**
 * The heaviest single run's input.
 *
 * NOT one prompt: a run is metered once with `totalUsage`, which the AI SDK
 * aggregates over every step the run took. A run that called three tools sends
 * the whole prompt four times and reports the sum here. That is exactly why
 * this number is worth showing next to the thread total — it makes the
 * per-step multiplier visible instead of leaving the reader to assume they
 * somehow wrote that much text.
 */
export function largestRunInputTokens(
  events: readonly ThreadUsageEvent[]
): number {
  return events.reduce((max, event) => Math.max(max, event.input_tokens), 0);
}

/** `12:04:31` in the reader's locale, or `—` for an unparseable stamp. */
export function formatUsageEventTime(occurredAt: string): string {
  const date = new Date(occurredAt);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
