// Mastra `StreamErrorRetryProcessor`, configured for the gateway-routed
// providers this deployment runs on.
//
// What retries and what does not:
//   - HTTP 408/409/429/5xx: the AI SDK marks these `isRetryable`, which the
//     processor honors on its own (provider `Retry-After` respected, capped).
//   - a socket that died mid-stream (`ECONNRESET`, `fetch failed`, `socket hang
//     up`, `terminated`): matched here — the SDK does not flag those.
//   - everything else (bad request, auth, provider moderation such as
//     DeepSeek's `data_inspection_failed`, context overflow): terminal. A
//     retry would repeat the same rejection and delay the named failure.

import { StreamErrorRetryProcessor } from "@mastra/core/processors";

export const STREAM_ERROR_MAX_RETRIES = 2;
/** First wait 1s, then 2s: enough for a transient blip, short for a person. */
export const STREAM_ERROR_BASE_DELAY_MS = 1000;

const TRANSIENT_NETWORK_MARKERS = [
  "econnreset",
  "econnrefused",
  "etimedout",
  "socket hang up",
  "fetch failed",
  "terminated",
  "network error",
  "other side closed",
  "premature close",
] as const;

function messageOf(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  const record = error as { message?: unknown; code?: unknown } | null;
  const message = typeof record?.message === "string" ? record.message : "";
  const code = typeof record?.code === "string" ? record.code : "";
  return `${code} ${message}`.toLowerCase();
}

/** A dropped connection, as Node's fetch/undici report it. */
export function isTransientNetworkError(error: unknown): boolean {
  const text = messageOf(error);
  if (!text.trim()) {
    return false;
  }
  return TRANSIENT_NETWORK_MARKERS.some((marker) => text.includes(marker));
}

export function createStreamErrorRetryProcessor(): StreamErrorRetryProcessor {
  return new StreamErrorRetryProcessor({
    delayMs: ({ retryCount }) => STREAM_ERROR_BASE_DELAY_MS * 2 ** retryCount,
    matchers: [isTransientNetworkError],
    maxRetries: STREAM_ERROR_MAX_RETRIES,
    retryUnknownErrors: false,
  });
}
