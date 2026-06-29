/**
 * Normalizes a raw base URL: trim and remove a single trailing slash.
 * Returns empty string when missing or whitespace-only.
 */
export function normalizeAiBaseUrl(raw: string | undefined | null): string {
  return (raw ?? "").trim().replace(/\/$/, "");
}

/** Interprets raw env: missing or blank → `undefined` (caller shows “not configured”). */
export function resolveAiServiceBaseUrlFromRaw(
  raw: string | undefined
): string | undefined {
  const normalized = normalizeAiBaseUrl(raw);
  if (!normalized) {
    return;
  }
  return normalized;
}

/**
 * Base URL for **`@engenty/ai`** (no trailing slash), from **`VITE_ENGENTY_AI_BASE_URL` only**.
 * Returns `undefined` when the variable is unset or blank — callers must surface a configuration error.
 */
export function resolveAiServiceBaseUrl(): string | undefined {
  const raw = (
    import.meta as ImportMeta & { env?: Record<string, string | undefined> }
  ).env?.VITE_ENGENTY_AI_BASE_URL;
  return resolveAiServiceBaseUrlFromRaw(raw);
}
