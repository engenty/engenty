import { isEngentyDevelopmentEnvironment } from "./engenty-environment.js";

export const ENGENTY_DEVELOPER_MODE_STORAGE_KEY = "engenty.developer_mode";

const CHANGE_EVENT = "engenty-developer-mode-change";

function canUseStorage(): boolean {
  return (
    typeof globalThis !== "undefined" &&
    typeof globalThis.localStorage !== "undefined"
  );
}

/** Persisted UI toggle: only meaningful when {@link isEngentyDevelopmentEnvironment} is true. */
export function getDeveloperModePreference(): boolean {
  if (!canUseStorage()) {
    return false;
  }
  try {
    return (
      globalThis.localStorage.getItem(ENGENTY_DEVELOPER_MODE_STORAGE_KEY) ===
      "1"
    );
  } catch {
    return false;
  }
}

export function setDeveloperModePreference(enabled: boolean): void {
  if (!canUseStorage()) {
    return;
  }
  try {
    if (enabled) {
      globalThis.localStorage.setItem(ENGENTY_DEVELOPER_MODE_STORAGE_KEY, "1");
    } else {
      globalThis.localStorage.removeItem(ENGENTY_DEVELOPER_MODE_STORAGE_KEY);
    }
    globalThis.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // ignore quota / private mode
  }
}

/** Subscribe to same-tab preference updates from {@link setDeveloperModePreference}. */
export function subscribeDeveloperModePreference(
  onChange: () => void
): () => void {
  if (typeof globalThis.addEventListener !== "function") {
    return () => {};
  }
  const handler = () => {
    onChange();
  };
  globalThis.addEventListener(CHANGE_EVENT, handler);
  const onStorage = (e: StorageEvent) => {
    if (e.key === ENGENTY_DEVELOPER_MODE_STORAGE_KEY || e.key === null) {
      onChange();
    }
  };
  globalThis.addEventListener("storage", onStorage);
  return () => {
    globalThis.removeEventListener(CHANGE_EVENT, handler);
    globalThis.removeEventListener("storage", onStorage);
  };
}

/**
 * Use for conditional developer-only UI: workspace is `ENV=development` and the
 * operator enabled Developer mode in the user menu.
 */
export function isEngentyDeveloperModeUiEnabled(): boolean {
  return isEngentyDevelopmentEnvironment() && getDeveloperModePreference();
}
