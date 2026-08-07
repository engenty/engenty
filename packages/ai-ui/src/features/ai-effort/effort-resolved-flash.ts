import type { AiEffort } from "@engenty/ai-core/browser";
import { useSyncExternalStore } from "react";

/**
 * "Auto chose X" state for the effort control — keyed per host so drawer vs
 * full-page don't stomp each other.
 *
 * Two lifetimes, deliberately:
 * - `value` is the transient FLASH that highlights the trigger, cleared after
 *   a short TTL so the control settles back to the user's "Auto" label.
 * - `resolved` is STICKY. "Which tier is Auto actually running?" stays true
 *   after the highlight fades, and the chooser answers it on every open — a
 *   fact with no TTL should not be told through a TTL'd flash.
 */

export interface EffortResolvedFlash {
  at: number;
  effort: AiEffort;
  modelId?: string | null;
  reason?: string;
  source?: string;
}

// Long enough to actually be read: the selector is now the ONLY surface that
// reports an Auto resolution (there is no toast), and it competes with a
// streaming answer for attention.
const FLASH_TTL_MS = 8000;

interface FlashStore {
  listeners: Set<() => void>;
  /** Last resolution, no expiry — drives the chooser's "currently active" mark. */
  resolved: EffortResolvedFlash | null;
  value: EffortResolvedFlash | null;
}

const stores = new Map<string, FlashStore>();

function getStore(hostKey: string): FlashStore {
  let store = stores.get(hostKey);
  if (!store) {
    store = { listeners: new Set(), resolved: null, value: null };
    stores.set(hostKey, store);
  }
  return store;
}

function notify(store: FlashStore) {
  for (const listener of store.listeners) {
    listener();
  }
}

/** Publish a fresh Auto resolution for this host (trigger flash + sticky mark). */
export function publishEffortResolvedFlash(
  hostKey: string,
  flash: Omit<EffortResolvedFlash, "at">
): EffortResolvedFlash {
  const store = getStore(hostKey);
  const next: EffortResolvedFlash = { ...flash, at: Date.now() };
  store.value = next;
  store.resolved = next;
  notify(store);
  // Auto-clear so the selector reverts to the user's "Auto" label.
  window.setTimeout(() => {
    if (store.value?.at === next.at) {
      store.value = null;
      notify(store);
    }
  }, FLASH_TTL_MS);
  return next;
}

export function getEffortResolvedFlash(
  hostKey: string
): EffortResolvedFlash | null {
  const value = getStore(hostKey).value;
  if (!value) {
    return null;
  }
  if (Date.now() - value.at > FLASH_TTL_MS) {
    return null;
  }
  return value;
}

export function subscribeEffortResolvedFlash(
  hostKey: string,
  listener: () => void
): () => void {
  const store = getStore(hostKey);
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}

export function useEffortResolvedFlash(
  hostKey: string
): EffortResolvedFlash | null {
  return useSyncExternalStore(
    (listener) => subscribeEffortResolvedFlash(hostKey, listener),
    () => getEffortResolvedFlash(hostKey),
    () => null
  );
}

/** Last Auto resolution for this host, with no expiry. */
export function getEffortLastResolved(
  hostKey: string
): EffortResolvedFlash | null {
  return getStore(hostKey).resolved;
}

export function useEffortLastResolved(
  hostKey: string
): EffortResolvedFlash | null {
  return useSyncExternalStore(
    (listener) => subscribeEffortResolvedFlash(hostKey, listener),
    () => getEffortLastResolved(hostKey),
    () => null
  );
}

/** Test helper — drop all flashes. */
export function resetEffortResolvedFlashes() {
  for (const store of stores.values()) {
    store.resolved = null;
    store.value = null;
    notify(store);
  }
  stores.clear();
}
