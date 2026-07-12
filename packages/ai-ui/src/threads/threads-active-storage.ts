// Active-thread map with two layers: sessionStorage is per-tab authoritative
// (each tab keeps its own bound thread); localStorage is only a seed so a new
// tab inherits the last session touched anywhere. A tab never re-reads
// localStorage after it has its own entry — cross-tab writes must not retarget
// an already-bound tab.

import { isAgentThreadId } from "@engenty/ai-core/browser";

const THREADS_ACTIVE_MAP_STORAGE_KEY = "engenty:threads:active";

/** Sentinel stored per-tab when the host's active thread was explicitly cleared,
 * so the tab does not fall back to the localStorage seed. */
const CLEARED_SENTINEL = "cleared";

function trimOrEmpty(value: string | null | undefined): string {
  return (value ?? "").trim();
}

type StorageArea = "session" | "local";

function storageFor(area: StorageArea): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  return area === "session" ? window.sessionStorage : window.localStorage;
}

function readMap(
  area: StorageArea,
  options?: { allowClearedSentinel?: boolean }
): Record<string, string> {
  const storage = storageFor(area);
  if (!storage) {
    return {};
  }
  try {
    const raw = storage.getItem(THREADS_ACTIVE_MAP_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    const map: Record<string, string> = {};
    for (const [key, value] of Object.entries(
      parsed as Record<string, unknown>
    )) {
      const threadId = trimOrEmpty(typeof value === "string" ? value : null);
      const valid =
        threadId &&
        (isAgentThreadId(threadId) ||
          (options?.allowClearedSentinel && threadId === CLEARED_SENTINEL));
      if (key.trim() && valid) {
        map[key.trim()] = threadId;
      }
    }
    return map;
  } catch {
    return {};
  }
}

function writeMap(area: StorageArea, map: Record<string, string>): void {
  const storage = storageFor(area);
  if (!storage) {
    return;
  }
  try {
    if (Object.keys(map).length === 0) {
      storage.removeItem(THREADS_ACTIVE_MAP_STORAGE_KEY);
      return;
    }
    storage.setItem(THREADS_ACTIVE_MAP_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // private mode / quota
  }
}

export function readActiveThreadIdForHost(hostKey: string): string | null {
  const key = hostKey.trim();
  const tabMap = readMap("session", { allowClearedSentinel: true });
  const tabValue = tabMap[key];
  if (tabValue === CLEARED_SENTINEL) {
    return null;
  }
  if (tabValue && isAgentThreadId(tabValue)) {
    return tabValue;
  }
  // No per-tab entry yet — seed once from the shared map so a new tab
  // inherits the last session, then pin it for this tab.
  const seeded = readMap("local")[key];
  if (seeded && isAgentThreadId(seeded)) {
    tabMap[key] = seeded;
    writeMap("session", tabMap);
    return seeded;
  }
  return null;
}

export function writeActiveThreadIdForHost(
  hostKey: string,
  threadId: string | null
): void {
  const key = hostKey.trim();
  const valid = threadId && isAgentThreadId(threadId);

  const tabMap = readMap("session", { allowClearedSentinel: true });
  if (valid) {
    tabMap[key] = threadId;
  } else {
    tabMap[key] = CLEARED_SENTINEL;
  }
  writeMap("session", tabMap);

  // localStorage stays the seed for future tabs (last writer wins).
  const sharedMap = readMap("local");
  if (valid) {
    sharedMap[key] = threadId;
  } else {
    delete sharedMap[key];
  }
  writeMap("local", sharedMap);
}

export function readAllActiveThreadIds(): Record<string, string> {
  // Shared view (seed map) merged with this tab's authoritative bindings.
  const merged = { ...readMap("local") };
  for (const [key, value] of Object.entries(
    readMap("session", { allowClearedSentinel: true })
  )) {
    if (value === CLEARED_SENTINEL) {
      delete merged[key];
    } else {
      merged[key] = value;
    }
  }
  return merged;
}
