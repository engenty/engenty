/**
 * Shared live-query cadence. TanStack Query already skips interval fetches
 * when `document.visibilityState === "hidden"` unless
 * `refetchIntervalInBackground` is true — pin that on the client defaults and
 * keep this helper for stagger so equal intervals do not fire in lockstep.
 */

/** Extra delay as a fraction of the base interval (never shortens it). */
export const POLL_STAGGER_RATIO = 0.2;

/**
 * Desktop shell stays live in the tray; a browser tab can idle.
 * Use as `refetchIntervalInBackground` on the rare query that must keep
 * polling while hidden (notifications in Tauri).
 */
export function keepPollingWhenHidden(): boolean {
  return (
    typeof globalThis !== "undefined" && "__TAURI_INTERNALS__" in globalThis
  );
}

/** Deterministic extra delay so two 30s polls never share a tick. */
export function staggerPollMs(intervalMs: number, salt: string): number {
  const span = Math.max(1, Math.round(intervalMs * POLL_STAGGER_RATIO));
  let hash = 5381;
  for (let i = 0; i < salt.length; i += 1) {
    hash = (hash * 33 + salt.charCodeAt(i)) % 1_000_003;
  }
  return intervalMs + (hash % span);
}

/** `false` stays off; a number is offset by `salt` and never shortened. */
export function staggeredRefetchInterval(
  intervalMs: number | false,
  salt: string
): number | false {
  if (intervalMs === false) {
    return false;
  }
  return staggerPollMs(intervalMs, salt);
}
