import type { AiEffort } from "@engenty/ai-core/browser";
import { useSyncExternalStore } from "react";

/**
 * Transient "Auto chose X" flash for the effort control — keyed per host so
 * drawer vs full-page don't stomp each other. Cleared after a short TTL.
 */

export interface EffortResolvedFlash {
  at: number;
  effort: AiEffort;
  modelId?: string | null;
  reason?: string;
  source?: string;
}

const FLASH_TTL_MS = 2800;

interface FlashStore {
  listeners: Set<() => void>;
  value: EffortResolvedFlash | null;
}

const stores = new Map<string, FlashStore>();

function getStore(hostKey: string): FlashStore {
  let store = stores.get(hostKey);
  if (!store) {
    store = { listeners: new Set(), value: null };
    stores.set(hostKey, store);
  }
  return store;
}

function notify(store: FlashStore) {
  for (const listener of store.listeners) {
    listener();
  }
}

/** Publish a fresh Auto resolution for this host (toast + selector flash). */
export function publishEffortResolvedFlash(
  hostKey: string,
  flash: Omit<EffortResolvedFlash, "at">
): EffortResolvedFlash {
  const store = getStore(hostKey);
  const next: EffortResolvedFlash = { ...flash, at: Date.now() };
  store.value = next;
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

/** Test helper — drop all flashes. */
export function resetEffortResolvedFlashes() {
  for (const store of stores.values()) {
    store.value = null;
    notify(store);
  }
  stores.clear();
}
