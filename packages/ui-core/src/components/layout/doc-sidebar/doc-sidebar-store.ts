import { useCallback, useSyncExternalStore } from "react";

/**
 * Doc sidebar — the sidebar belonging to a document/detail view (task
 * properties, offer settings, file metadata). Shared, keyed state so the
 * toggle button (rendered in the app topbar via `usePageConfig` actions —
 * a different React subtree) and the layout stay in sync without a
 * provider spanning both.
 *
 * State model:
 * - `preferredOpen` — the user's inline-visibility preference, persisted per
 *   `storageKey`. Only applies while the sidebar fits inline.
 * - `overlayOpen` — transient overlay (Sheet) visibility when the container
 *   is too narrow for an inline column. Never persisted: a page must not
 *   load with a modal overlay already open.
 * - `mode` — measured by `DocSidebarLayout` from its container width.
 */
export type DocSidebarMode = "inline" | "overlay";

export interface DocSidebarState {
  mode: DocSidebarMode;
  overlayOpen: boolean;
  preferredOpen: boolean;
}

interface DocSidebarStore {
  listeners: Set<() => void>;
  state: DocSidebarState;
}

const STORAGE_PREFIX = "engenty.doc_sidebar:";

const stores = new Map<string, DocSidebarStore>();

function readPreferredOpen(storageKey: string): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  try {
    return (
      window.localStorage.getItem(STORAGE_PREFIX + storageKey) !== "closed"
    );
  } catch {
    return true;
  }
}

function writePreferredOpen(storageKey: string, open: boolean) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      STORAGE_PREFIX + storageKey,
      open ? "open" : "closed"
    );
  } catch {
    // Persistence is best-effort; in-memory state still applies.
  }
}

function getStore(storageKey: string): DocSidebarStore {
  let store = stores.get(storageKey);
  if (!store) {
    store = {
      listeners: new Set(),
      state: {
        mode: "inline",
        overlayOpen: false,
        preferredOpen: readPreferredOpen(storageKey),
      },
    };
    stores.set(storageKey, store);
  }
  return store;
}

function patchState(storageKey: string, patch: Partial<DocSidebarState>) {
  const store = getStore(storageKey);
  const prev = store.state;
  const next = { ...prev, ...patch };
  if (
    next.mode === prev.mode &&
    next.overlayOpen === prev.overlayOpen &&
    next.preferredOpen === prev.preferredOpen
  ) {
    return;
  }
  store.state = next;
  for (const listener of store.listeners) {
    listener();
  }
}

/** Layout-only: publish the measured mode; leaving overlay closes it. */
export function setDocSidebarMode(storageKey: string, mode: DocSidebarMode) {
  const current = getStore(storageKey).state;
  patchState(storageKey, {
    mode,
    overlayOpen: mode === "overlay" ? current.overlayOpen : false,
  });
}

export function setDocSidebarOverlayOpen(storageKey: string, open: boolean) {
  patchState(storageKey, { overlayOpen: open });
}

export interface UseDocSidebarResult {
  mode: DocSidebarMode;
  /** Effective visibility for the current mode. */
  open: boolean;
  setOverlayOpen: (open: boolean) => void;
  toggle: () => void;
}

export function useDocSidebar(storageKey: string): UseDocSidebarResult {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const store = getStore(storageKey);
      store.listeners.add(onStoreChange);
      return () => {
        store.listeners.delete(onStoreChange);
      };
    },
    [storageKey]
  );
  const getSnapshot = useCallback(
    () => getStore(storageKey).state,
    [storageKey]
  );
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const toggle = useCallback(() => {
    const current = getStore(storageKey).state;
    if (current.mode === "inline") {
      const nextOpen = !current.preferredOpen;
      writePreferredOpen(storageKey, nextOpen);
      patchState(storageKey, { preferredOpen: nextOpen });
      return;
    }
    patchState(storageKey, { overlayOpen: !current.overlayOpen });
  }, [storageKey]);

  const setOverlayOpen = useCallback(
    (open: boolean) => setDocSidebarOverlayOpen(storageKey, open),
    [storageKey]
  );

  return {
    mode: state.mode,
    open: state.mode === "inline" ? state.preferredOpen : state.overlayOpen,
    setOverlayOpen,
    toggle,
  };
}
