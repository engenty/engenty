import type { Space } from "@/lib/api/spaces-client";

/** Last `/s/<key>` the URL carried. Survives reload so `/` can send you back. */
export const LAST_SPACE_STORAGE_KEY = "engenty.last-space-key";

let lastSpaceKey: string | null = null;
let hydratedFromStorage = false;

function readPersistedSpaceKey(): string | null {
  try {
    const value = localStorage.getItem(LAST_SPACE_STORAGE_KEY);
    return value?.trim() ? value : null;
  } catch {
    return null;
  }
}

function persistSpaceKey(key: string): void {
  try {
    localStorage.setItem(LAST_SPACE_STORAGE_KEY, key);
  } catch {
    // Private mode / quota — memory still holds the session hint.
  }
}

/**
 * The last space key the URL carried. In-memory for the current tab, then
 * localStorage so a reload of `/` or a dead link still knows where you were.
 */
export function rememberedSpaceKey(): string | null {
  if (!hydratedFromStorage) {
    lastSpaceKey = lastSpaceKey ?? readPersistedSpaceKey();
    hydratedFromStorage = true;
  }
  return lastSpaceKey;
}

/** Call when the URL is inside `/s/<key>/…`. */
export function rememberSpaceKey(key: string): void {
  lastSpaceKey = key;
  hydratedFromStorage = true;
  persistSpaceKey(key);
}

export function resetRememberedSpaceKeyForTests(): void {
  lastSpaceKey = null;
  hydratedFromStorage = false;
  try {
    localStorage.removeItem(LAST_SPACE_STORAGE_KEY);
  } catch {
    // jsdom without storage
  }
}

/** Drop the in-memory copy so the next read loads localStorage, as a reload would. */
export function forgetRememberedSpaceKeyMemoryForTests(): void {
  lastSpaceKey = null;
  hydratedFromStorage = false;
}

type LandingSpace = Pick<
  Space,
  "deletedAt" | "isDefault" | "key" | "ownerUserId"
>;

/**
 * Where the app should put you when the URL does not name a place: last
 * visited space (if you still belong to it), then personal, then the tenant
 * default. Copilot is the dock, not this fallback.
 */
export function pickLandingSpace<T extends LandingSpace>(
  spaces: readonly T[],
  rememberedKey: string | null
): T | null {
  const live = spaces.filter((space) => space.deletedAt == null);
  if (rememberedKey) {
    const remembered = live.find((space) => space.key === rememberedKey);
    if (remembered) {
      return remembered;
    }
  }
  return (
    live.find((space) => space.ownerUserId != null) ??
    live.find((space) => space.isDefault) ??
    live[0] ??
    null
  );
}
