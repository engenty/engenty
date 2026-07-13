import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Artifact store — the interface the artifact pane and its consumers program
 * against. Artifacts are first-class addressable entities (id, type, title,
 * session linkage); see docs/wip/app-shell-unification.md §Phase 2.
 *
 * PLACEHOLDER IMPLEMENTATION: this in-memory keyed store carries the final
 * interface but no persistence. The proper implementation (persisted per
 * session, listable, survives reload) replaces the internals behind
 * `useArtifacts`/`openArtifact` without touching consumers. Do not build
 * interim layers on top of the in-memory behavior.
 */
export interface EngentyArtifact {
  id: string;
  /** Type-specific payload; the renderer registry resolves by `type`. */
  payload?: unknown;
  sourceToolCallId?: string | null;
  threadId?: string | null;
  title: string;
  type: string;
}

export interface ArtifactsState {
  /** Active tab id. */
  activeId: string | null;
  /** Open artifacts in tab order. */
  artifacts: EngentyArtifact[];
  paneOpen: boolean;
}

interface ArtifactsStore {
  listeners: Set<() => void>;
  state: ArtifactsState;
}

const EMPTY_STATE: ArtifactsState = {
  activeId: null,
  artifacts: [],
  paneOpen: false,
};

const stores = new Map<string, ArtifactsStore>();

function getStore(hostKey: string): ArtifactsStore {
  let store = stores.get(hostKey);
  if (!store) {
    store = { listeners: new Set(), state: EMPTY_STATE };
    stores.set(hostKey, store);
  }
  return store;
}

function setState(hostKey: string, next: ArtifactsState) {
  const store = getStore(hostKey);
  store.state = next;
  for (const listener of store.listeners) {
    listener();
  }
}

/** Open (or re-activate) an artifact and reveal the pane. */
export function openArtifact(hostKey: string, artifact: EngentyArtifact) {
  const { state } = getStore(hostKey);
  const exists = state.artifacts.some((a) => a.id === artifact.id);
  setState(hostKey, {
    activeId: artifact.id,
    artifacts: exists ? state.artifacts : [...state.artifacts, artifact],
    paneOpen: true,
  });
}

export function activateArtifact(hostKey: string, id: string) {
  const { state } = getStore(hostKey);
  if (!state.artifacts.some((a) => a.id === id)) {
    return;
  }
  setState(hostKey, { ...state, activeId: id });
}

/** Close a tab; activates its neighbor, closes the pane when none remain. */
export function closeArtifact(hostKey: string, id: string) {
  const { state } = getStore(hostKey);
  const index = state.artifacts.findIndex((a) => a.id === id);
  if (index === -1) {
    return;
  }
  const artifacts = state.artifacts.filter((a) => a.id !== id);
  const activeId =
    state.activeId === id
      ? (artifacts[Math.min(index, artifacts.length - 1)]?.id ?? null)
      : state.activeId;
  setState(hostKey, {
    activeId,
    artifacts,
    paneOpen: artifacts.length > 0 && state.paneOpen,
  });
}

export function setArtifactPaneOpen(hostKey: string, open: boolean) {
  const { state } = getStore(hostKey);
  if (state.paneOpen === open) {
    return;
  }
  setState(hostKey, { ...state, paneOpen: open });
}

/**
 * Dev-only: seed placeholder artifacts so the pane UI is exercisable before
 * the proper artifact backend lands. No-op when the store already has tabs.
 */
export function seedPlaceholderArtifacts(
  hostKey: string,
  artifacts: EngentyArtifact[]
) {
  const { state } = getStore(hostKey);
  if (state.artifacts.length > 0) {
    return;
  }
  setState(hostKey, {
    activeId: artifacts[0]?.id ?? null,
    artifacts,
    paneOpen: state.paneOpen,
  });
}

export function clearArtifactsForTests(hostKey: string) {
  setState(hostKey, EMPTY_STATE);
}

export interface UseArtifactsResult extends ArtifactsState {
  activate: (id: string) => void;
  close: (id: string) => void;
  open: (artifact: EngentyArtifact) => void;
  setPaneOpen: (open: boolean) => void;
  togglePane: () => void;
}

export function useArtifacts(hostKey: string): UseArtifactsResult {
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
      close: (id: string) => closeArtifact(hostKey, id),
      open: (artifact: EngentyArtifact) => openArtifact(hostKey, artifact),
      setPaneOpen: (open: boolean) => setArtifactPaneOpen(hostKey, open),
      togglePane: () =>
        setArtifactPaneOpen(hostKey, !getStore(hostKey).state.paneOpen),
    }),
    [hostKey, state]
  );
}
