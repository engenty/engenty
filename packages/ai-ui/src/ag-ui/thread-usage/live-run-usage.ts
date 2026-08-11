"use client";

import type { EngentyUsageUpdatePayload } from "@engenty/ag-ui-bridge";
import { useSyncExternalStore } from "react";

/**
 * Live token usage for the run currently streaming on a thread.
 *
 * A module-level store rather than query state: these numbers arrive on the
 * AG-UI stream (one CUSTOM event per model step) and are consumed by a
 * component that is nowhere near the stream hook. Same shape as the effort
 * flash store next door.
 *
 * Cleared when the run ends — the settled figures then come from the server,
 * which is the authority, and leaving a stale live number beside them would
 * show two different totals for the same run.
 */
const byThread = new Map<string, EngentyUsageUpdatePayload>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function publishLiveRunUsage(
  threadId: string,
  usage: EngentyUsageUpdatePayload
): void {
  byThread.set(threadId, usage);
  emit();
}

export function clearLiveRunUsage(threadId: string): void {
  if (byThread.delete(threadId)) {
    emit();
  }
}

/**
 * The running total for `threadId`, or null when no run is streaming.
 *
 * `useSyncExternalStore` returns the stored object identity, so a re-render
 * only happens when a step actually reported new usage.
 */
export function useLiveRunUsage(
  threadId: string | null
): EngentyUsageUpdatePayload | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (threadId ? (byThread.get(threadId) ?? null) : null),
    () => null
  );
}
