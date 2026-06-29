/**
 * Client-side logging for copilot and other UI surfaces.
 * Sends operational errors to the API ingest endpoint when available.
 */

export interface ReportCopilotErrorOptions {
  /** Optional API base URL (e.g. from apiUrl prop). Uses relative path when omitted. */
  apiBaseUrl?: string;
  error?: string;
  /** Additional context */
  module?: string;
  routeKey?: string;
  [key: string]: unknown;
}

/**
 * Report a copilot error to the server. Fire-and-forget; never throws.
 * Uses /api/evlog/ingest when the API is reachable.
 */
export function reportCopilotError(
  err: unknown,
  options: ReportCopilotErrorOptions = {}
): void {
  const message = err instanceof Error ? err.message : String(err);
  const payload = {
    timestamp: new Date().toISOString(),
    level: "error" as const,
    message,
    ...options,
  };

  let base = options.apiBaseUrl;
  if (typeof base === "string" && base.startsWith("http")) {
    try {
      base = new URL(base).origin;
    } catch {
      base = typeof window === "undefined" ? "" : window.location.origin;
    }
  } else {
    base = typeof window === "undefined" ? "" : window.location.origin;
  }
  const url = base
    ? `${base.replace(/\/$/, "")}/api/evlog/ingest`
    : "/api/evlog/ingest";

  if (typeof window !== "undefined" && window.navigator?.sendBeacon) {
    try {
      const blob = new Blob([JSON.stringify(payload)], {
        type: "application/json",
      });
      window.navigator.sendBeacon(url, blob);
      return;
    } catch {
      // fall through to fetch
    }
  }

  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Fire-and-forget; ignore fetch failures
  });
}
