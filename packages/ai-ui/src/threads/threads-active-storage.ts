import { isAgentThreadId } from "@engenty/ai-core/browser";

const THREADS_ACTIVE_MAP_STORAGE_KEY = "engenty:threads:active";

function trimOrEmpty(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function readActiveMap(): Record<string, string> {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(THREADS_ACTIVE_MAP_STORAGE_KEY);
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
      if (key.trim() && threadId && isAgentThreadId(threadId)) {
        map[key.trim()] = threadId;
      }
    }
    return map;
  } catch {
    return {};
  }
}

function writeActiveMap(map: Record<string, string>): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const keys = Object.keys(map);
    if (keys.length === 0) {
      window.localStorage.removeItem(THREADS_ACTIVE_MAP_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      THREADS_ACTIVE_MAP_STORAGE_KEY,
      JSON.stringify(map)
    );
  } catch {
    // private mode / quota
  }
}

export function readActiveThreadIdForHost(hostKey: string): string | null {
  const map = readActiveMap();
  const threadId = map[hostKey.trim()];
  return threadId && isAgentThreadId(threadId) ? threadId : null;
}

export function writeActiveThreadIdForHost(
  hostKey: string,
  threadId: string | null
): void {
  const key = hostKey.trim();
  const map = readActiveMap();
  if (threadId && isAgentThreadId(threadId)) {
    map[key] = threadId;
  } else {
    delete map[key];
  }
  writeActiveMap(map);
}

export function readAllActiveThreadIds(): Record<string, string> {
  return readActiveMap();
}
