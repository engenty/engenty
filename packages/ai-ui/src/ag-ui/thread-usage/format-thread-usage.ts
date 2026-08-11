export interface ThreadUsageTotals {
  cached_tokens: number;
  cost_micros: number;
  currency: string;
  event_count: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
}

/**
 * Every token the thread moved: input + output.
 *
 * `cached_tokens` and `reasoning_tokens` are NOT added. They are breakdowns,
 * not extra dimensions — the AI SDK reports `inputTokenDetails.cacheReadTokens`
 * as the cached SLICE of `inputTokens`, and `outputTokenDetails.reasoningTokens`
 * as the reasoning slice of `outputTokens`. Adding them counted a large part of
 * a cache-heavy thread twice and made the composer's headline read up to ~2×
 * the tokens the thread actually used.
 */
export function sumThreadUsageTokens(usage: ThreadUsageTotals): number {
  return usage.input_tokens + usage.output_tokens;
}

/** The part of `input_tokens` that was NOT served from the prompt cache. */
export function freshInputTokens(usage: ThreadUsageTotals): number {
  return Math.max(0, usage.input_tokens - usage.cached_tokens);
}

/** USD micros → display string (4 decimal places for sub-cent chat costs). */
export function formatUsageCostMicros(
  costMicros: number,
  currency = "usd"
): string | null {
  if (!Number.isFinite(costMicros) || costMicros <= 0) {
    return null;
  }
  const normalized = currency.trim().toLowerCase();
  const amount = costMicros / 1_000_000;
  if (normalized === "usd") {
    return `$${amount.toFixed(4)}`;
  }
  if (normalized === "eur") {
    return `€${amount.toFixed(4)}`;
  }
  return `${amount.toFixed(4)} ${currency.toUpperCase()}`;
}

export function formatCompactTokenCount(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) {
    return "0";
  }
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 10_000) {
    return `${Math.round(tokens / 1000)}k`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return String(Math.round(tokens));
}

export function formatCopilotUsageLine(input: {
  costLabel: string | null;
  tokenLabel: string;
}): string {
  if (input.costLabel) {
    return `${input.tokenLabel} · ${input.costLabel}`;
  }
  return input.tokenLabel;
}
