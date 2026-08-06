import {
  formatObjectRef,
  type ObjectRef,
  parseObjectRef,
} from "@engenty/ai-core/browser";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";

/**
 * Artifact pane UI state, keyed per host. The artifact *list* is server data
 * (see artifacts-api.ts) — the tabs are the active thread's artifacts. This
 * store holds only the transient view state: which tab is active and whether
 * the pane is open / expanded — plus session-transient tabs for module objects
 * and workspace files (they vanish on reload; the list/card re-opens them).
 */
export interface ObjectPaneTab {
  /** Tab id in the shared tab strip: `object:<module>:<entity>:<id>`. */
  key: string;
  ref: ObjectRef;
  title: string;
}

export interface WorkFilePaneTab {
  /** Storage key passed to signed-URL / download APIs. */
  entryKey: string;
  filename: string;
  /** Tab id in the shared tab strip: `workfile:<entryKey>`. */
  key: string;
}

export interface ArtifactPaneState {
  activeId: string | null;
  fileTabs: WorkFilePaneTab[];
  objectTabs: ObjectPaneTab[];
  paneExpanded: boolean;
  paneOpen: boolean;
  /**
   * Artifact ids that arrived while the pane was closed. Cleared when the pane
   * opens. Drives the topbar badge so users notice new work without auto-opening.
   */
  unseenIds: string[];
}

interface ArtifactStore {
  listeners: Set<() => void>;
  state: ArtifactPaneState;
}

const EMPTY_STATE: ArtifactPaneState = {
  activeId: null,
  fileTabs: [],
  objectTabs: [],
  paneExpanded: false,
  paneOpen: false,
  unseenIds: [],
};

const OBJECT_TAB_PREFIX = "object:";
const WORK_FILE_TAB_PREFIX = "workfile:";

export function objectPaneTabKey(ref: ObjectRef): string {
  return `${OBJECT_TAB_PREFIX}${formatObjectRef(ref)}`;
}

export function isObjectPaneTabKey(id: string | null): boolean {
  return Boolean(id?.startsWith(OBJECT_TAB_PREFIX));
}

export function objectRefFromPaneTabKey(key: string): ObjectRef | null {
  return key.startsWith(OBJECT_TAB_PREFIX)
    ? parseObjectRef(key.slice(OBJECT_TAB_PREFIX.length))
    : null;
}

export function workFilePaneTabKey(entryKey: string): string {
  return `${WORK_FILE_TAB_PREFIX}${entryKey}`;
}

export function isWorkFilePaneTabKey(id: string | null): boolean {
  return Boolean(id?.startsWith(WORK_FILE_TAB_PREFIX));
}

/** Object or work-file tab — not an artifact id from the server list. */
export function isTransientPaneTabKey(id: string | null): boolean {
  return isObjectPaneTabKey(id) || isWorkFilePaneTabKey(id);
}

function firstTransientTabKey(state: ArtifactPaneState): string | null {
  return state.objectTabs[0]?.key ?? state.fileTabs[0]?.key ?? null;
}

const stores = new Map<string, ArtifactStore>();

function getStore(hostKey: string): ArtifactStore {
  let store = stores.get(hostKey);
  if (!store) {
    store = { listeners: new Set(), state: EMPTY_STATE };
    stores.set(hostKey, store);
  }
  return store;
}

function sameIdList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((id, i) => id === b[i]);
}

function setState(hostKey: string, next: ArtifactPaneState) {
  const store = getStore(hostKey);
  const prev = store.state;
  if (
    next.activeId === prev.activeId &&
    next.paneOpen === prev.paneOpen &&
    next.paneExpanded === prev.paneExpanded &&
    next.objectTabs === prev.objectTabs &&
    next.fileTabs === prev.fileTabs &&
    sameIdList(next.unseenIds, prev.unseenIds)
  ) {
    return;
  }
  store.state = next;
  for (const listener of store.listeners) {
    listener();
  }
}

/** Current pane-open flag, read fresh (not from a render-time snapshot) —
 * for callbacks (e.g. a realtime handler) deciding auto-open vs. badge. */
export function getArtifactPaneOpen(hostKey: string): boolean {
  return getStore(hostKey).state.paneOpen;
}

/** Make an artifact the active tab and reveal the pane. */
export function activateArtifact(hostKey: string, id: string) {
  const { state } = getStore(hostKey);
  setState(hostKey, {
    ...state,
    activeId: id,
    paneOpen: true,
    unseenIds: [],
  });
}

/** Set the active tab without changing pane visibility (list reconciliation). */
export function setActiveArtifact(hostKey: string, id: string | null) {
  const { state } = getStore(hostKey);
  setState(hostKey, { ...state, activeId: id });
}

export function setArtifactPaneOpen(hostKey: string, open: boolean) {
  const { state } = getStore(hostKey);
  setState(hostKey, {
    ...state,
    paneOpen: open,
    paneExpanded: open ? state.paneExpanded : false,
    unseenIds: open ? [] : state.unseenIds,
  });
}

/**
 * Open the pane. When nothing is focused yet (cold load → topbar toggle),
 * `fallbackActiveId` becomes the active tab so the body is not empty while
 * tabs are visible.
 */
export function openArtifactPane(
  hostKey: string,
  fallbackActiveId?: string | null
) {
  const { state } = getStore(hostKey);
  const activeId =
    state.activeId ?? fallbackActiveId ?? firstTransientTabKey(state);
  setState(hostKey, {
    ...state,
    activeId,
    paneOpen: true,
    unseenIds: [],
  });
}

/** Record artifacts that arrived while the pane was closed (topbar badge). */
export function markUnseenArtifacts(hostKey: string, ids: string[]) {
  if (ids.length === 0) {
    return;
  }
  const { state } = getStore(hostKey);
  if (state.paneOpen) {
    return;
  }
  const merged = new Set(state.unseenIds);
  for (const id of ids) {
    merged.add(id);
  }
  setState(hostKey, { ...state, unseenIds: [...merged] });
}

export function setArtifactPaneExpanded(hostKey: string, expanded: boolean) {
  const { state } = getStore(hostKey);
  if (!state.paneOpen) {
    return;
  }
  setState(hostKey, { ...state, paneExpanded: expanded });
}

/**
 * Open (or refocus) a module object as a pane tab. Tabs are transient view
 * state: closing or reloading discards them; the inline chat card re-opens
 * them. `expanded: true` additionally grows the pane over the main area.
 */
export function openObjectPaneTab(
  hostKey: string,
  ref: ObjectRef,
  opts?: { expanded?: boolean; title?: string }
) {
  const { state } = getStore(hostKey);
  const key = objectPaneTabKey(ref);
  const existing = state.objectTabs.find((tab) => tab.key === key);
  const title = opts?.title?.trim() || existing?.title || ref.id;
  const objectTabs = existing
    ? existing.title === title
      ? state.objectTabs
      : state.objectTabs.map((tab) =>
          tab.key === key ? { ...tab, title } : tab
        )
    : [...state.objectTabs, { key, ref, title }];
  setState(hostKey, {
    ...state,
    objectTabs,
    activeId: key,
    paneOpen: true,
    paneExpanded: opts?.expanded ?? state.paneExpanded,
    unseenIds: [],
  });
}

/**
 * Close an object tab. `remainingArtifactIds` (the caller's server list) picks
 * the next active tab; the pane closes when nothing is left to show.
 */
export function closeObjectPaneTab(
  hostKey: string,
  key: string,
  remainingArtifactIds: string[] = []
) {
  const { state } = getStore(hostKey);
  const objectTabs = state.objectTabs.filter((tab) => tab.key !== key);
  if (objectTabs.length === state.objectTabs.length) {
    return;
  }
  let next: Partial<ArtifactPaneState> = { objectTabs };
  if (state.activeId === key) {
    const fallback =
      remainingArtifactIds[0] ??
      objectTabs[0]?.key ??
      state.fileTabs[0]?.key ??
      null;
    next = fallback
      ? { ...next, activeId: fallback }
      : { ...next, activeId: null, paneOpen: false, paneExpanded: false };
  }
  setState(hostKey, { ...state, ...next });
}

/**
 * Open (or refocus) a workspace file as a pane tab — same split as artifacts.
 * Transient: closing or reloading discards the tab; the Files grid re-opens it.
 */
export function openWorkFilePaneTab(
  hostKey: string,
  file: { entryKey: string; filename: string },
  opts?: { expanded?: boolean }
) {
  const { state } = getStore(hostKey);
  const key = workFilePaneTabKey(file.entryKey);
  const filename = file.filename.trim() || file.entryKey;
  const existing = state.fileTabs.find((tab) => tab.key === key);
  const fileTabs = existing
    ? existing.filename === filename
      ? state.fileTabs
      : state.fileTabs.map((tab) =>
          tab.key === key ? { ...tab, filename } : tab
        )
    : [...state.fileTabs, { key, entryKey: file.entryKey, filename }];
  setState(hostKey, {
    ...state,
    fileTabs,
    activeId: key,
    paneOpen: true,
    paneExpanded: opts?.expanded ?? state.paneExpanded,
    unseenIds: [],
  });
}

/**
 * Close a work-file tab. Falls back to artifacts / other transient tabs, then
 * closes the pane when nothing remains.
 */
export function closeWorkFilePaneTab(
  hostKey: string,
  key: string,
  remainingArtifactIds: string[] = []
) {
  const { state } = getStore(hostKey);
  const fileTabs = state.fileTabs.filter((tab) => tab.key !== key);
  if (fileTabs.length === state.fileTabs.length) {
    return;
  }
  let next: Partial<ArtifactPaneState> = { fileTabs };
  if (state.activeId === key) {
    const fallback =
      remainingArtifactIds[0] ??
      state.objectTabs[0]?.key ??
      fileTabs[0]?.key ??
      null;
    next = fallback
      ? { ...next, activeId: fallback }
      : { ...next, activeId: null, paneOpen: false, paneExpanded: false };
  }
  setState(hostKey, { ...state, ...next });
}

export function clearArtifactsForTests(hostKey: string) {
  setState(hostKey, EMPTY_STATE);
}

export interface UseArtifactPaneResult extends ArtifactPaneState {
  activate: (id: string) => void;
  /** Open the pane, optionally focusing a tab when none is active. */
  openPane: (fallbackActiveId?: string | null) => void;
  setActive: (id: string | null) => void;
  setPaneExpanded: (expanded: boolean) => void;
  setPaneOpen: (open: boolean) => void;
  togglePane: () => void;
  /** Count of artifacts that arrived while the pane was closed. */
  unseenCount: number;
}

/**
 * Keep pane state in sync with the server list: when a freshly created
 * artifact appears, focus it (and open the pane if it is already open);
 * otherwise mark it unseen for the topbar badge. Reconcile the active tab
 * when it leaves the list, and re-seed when the scope changes.
 */
export function useArtifactListSync(params: {
  hostKey: string;
  /** Identity of the list source (thread id or scope tuple) — a change re-seeds so a different scope does not auto-open. */
  scopeKey: string | null;
  ids: string[];
  isReady: boolean;
}): void {
  const { hostKey, scopeKey, ids, isReady } = params;
  const knownRef = useRef<Set<string> | null>(null);
  const key = ids.join("");

  // Re-seed when the scope changes so a different chat/surface does not auto-open.
  useEffect(() => {
    knownRef.current = null;
  }, [scopeKey]);

  useEffect(() => {
    if (!isReady) {
      return;
    }
    if (knownRef.current === null) {
      knownRef.current = new Set(ids);
    } else {
      const fresh = ids.filter((id) => !knownRef.current?.has(id));
      const emptied = ids.length === 0 && knownRef.current.size > 0;
      knownRef.current = new Set(ids);
      if (fresh.length > 0) {
        const { state } = getStore(hostKey);
        if (state.paneOpen) {
          activateArtifact(hostKey, fresh[0]);
        } else {
          // Keep the conversation focused — badge + toggle open the pane.
          setActiveArtifact(hostKey, fresh[0]);
          markUnseenArtifacts(hostKey, fresh);
        }
      } else if (
        emptied &&
        getStore(hostKey).state.objectTabs.length === 0 &&
        getStore(hostKey).state.fileTabs.length === 0
      ) {
        // Closing (archiving) the last tab closes the pane — unless transient
        // object/file tabs are still open.
        setArtifactPaneOpen(hostKey, false);
      }
    }
    const state = getStore(hostKey).state;
    // Drop unseen ids that left the list (archived / scope change).
    if (state.unseenIds.length > 0) {
      const stillThere = state.unseenIds.filter((id) => ids.includes(id));
      if (stillThere.length !== state.unseenIds.length) {
        setState(hostKey, {
          ...getStore(hostKey).state,
          unseenIds: stillThere,
        });
      }
    }
    // Transient tabs are not in the artifact list; never steal their focus.
    if (isTransientPaneTabKey(getStore(hostKey).state.activeId)) {
      return;
    }
    const nextState = getStore(hostKey).state;
    if (nextState.activeId && !ids.includes(nextState.activeId)) {
      setActiveArtifact(hostKey, ids[0] ?? firstTransientTabKey(nextState));
    } else if (!nextState.activeId && nextState.paneOpen && ids.length > 0) {
      setActiveArtifact(hostKey, ids[0]);
    }
  }, [hostKey, isReady, key]);
}

export function useArtifacts(hostKey: string): UseArtifactPaneResult {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const store = getStore(hostKey);
      store.listeners.add(onStoreChange);
      return () => {
        store.listeners.delete(onStoreChange);
      };
    },
    [hostKey]
  );
  const getSnapshot = useCallback(() => getStore(hostKey).state, [hostKey]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return useMemo(
    () => ({
      ...state,
      activate: (id: string) => activateArtifact(hostKey, id),
      setActive: (id: string | null) => setActiveArtifact(hostKey, id),
      setPaneExpanded: (expanded: boolean) =>
        setArtifactPaneExpanded(hostKey, expanded),
      setPaneOpen: (open: boolean) => setArtifactPaneOpen(hostKey, open),
      openPane: (fallbackActiveId?: string | null) =>
        openArtifactPane(hostKey, fallbackActiveId),
      togglePane: () =>
        setArtifactPaneOpen(hostKey, !getStore(hostKey).state.paneOpen),
      unseenCount: state.unseenIds.length,
    }),
    [hostKey, state]
  );
}
