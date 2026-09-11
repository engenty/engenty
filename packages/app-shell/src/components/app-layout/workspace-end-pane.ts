import { useCallback, useSyncExternalStore } from "react";

/**
 * Workspace end-pane slot — a full-height column at the trailing edge of the
 * workspace, OUTSIDE the topbar+main column (the topbar spans only the main
 * area). `AppLayoutFrame` registers the slot element and owns the column's
 * width (one persisted east-west resize handle on its leading edge); routes
 * portal pane content (the artifact pane, the person's browser) into it via
 * `useWorkspaceEndPaneTarget`. Several panes STACK vertically and share the
 * width; a persisted split (percent of height for the first pane) with a
 * north-south handle between them, drawn by `WorkspaceEndPaneItem`. The
 * slot is width-less until a pane registers.
 *
 * `expanded` flips the flex roles: the slot takes the whole row and the
 * main column collapses to zero. Keyed per pane so two panes' effects cannot
 * undo each other — the column is expanded while ANY pane asks for it.
 */
interface WorkspaceEndPaneState {
  element: HTMLElement | null;
  expandedBy: ReadonlySet<string>;
  /** Panes currently mounted in the slot, in registration order. */
  panes: readonly string[];
  /** Height share of the first pane when two or more stack, in percent. */
  splitPct: number;
}

const SPLIT_STORAGE_KEY = "engenty.workspace_end_pane.split_pct";
const SPLIT_DEFAULT = 50;
const SPLIT_MIN = 20;
const SPLIT_MAX = 80;

function clampSplit(pct: number): number {
  if (!Number.isFinite(pct)) {
    return SPLIT_DEFAULT;
  }
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, Math.round(pct)));
}

function readStoredSplit(): number {
  try {
    const raw = window.localStorage.getItem(SPLIT_STORAGE_KEY);
    return raw === null ? SPLIT_DEFAULT : clampSplit(Number.parseFloat(raw));
  } catch {
    return SPLIT_DEFAULT;
  }
}

const SERVER_STATE: WorkspaceEndPaneState = {
  element: null,
  expandedBy: new Set(),
  panes: [],
  splitPct: SPLIT_DEFAULT,
};
let state: WorkspaceEndPaneState = SERVER_STATE;
const listeners = new Set<() => void>();

function setState(next: WorkspaceEndPaneState) {
  state = next;
  for (const listener of listeners) {
    listener();
  }
}

export function setWorkspaceEndPaneElement(el: HTMLElement | null) {
  if (el === state.element) {
    return;
  }
  setState({ ...state, element: el });
}

/** Ask for (or release) the expanded column on behalf of one pane. */
export function setWorkspaceEndPaneExpanded(key: string, expanded: boolean) {
  if (state.expandedBy.has(key) === expanded) {
    return;
  }
  const expandedBy = new Set(state.expandedBy);
  if (expanded) {
    expandedBy.add(key);
  } else {
    expandedBy.delete(key);
  }
  setState({ ...state, expandedBy });
}

/** A pane is in the slot; returns the unregister. Order = registration. */
export function registerWorkspaceEndPane(key: string): () => void {
  setState({
    ...state,
    panes: state.panes.includes(key) ? state.panes : [...state.panes, key],
    // First mount in this window: pick up the persisted split.
    splitPct: state.panes.length === 0 ? readStoredSplit() : state.splitPct,
  });
  return () => {
    setState({ ...state, panes: state.panes.filter((k) => k !== key) });
  };
}

/** Height share of the first pane; persisted when `persist` is set. */
export function setWorkspaceEndPaneSplit(pct: number, persist = false) {
  const next = clampSplit(pct);
  if (next !== state.splitPct) {
    setState({ ...state, splitPct: next });
  }
  if (persist) {
    try {
      window.localStorage.setItem(SPLIT_STORAGE_KEY, String(next));
    } catch {
      // Storage blocked; the split lives for the session only.
    }
  }
}

function useWorkspaceEndPaneState(): WorkspaceEndPaneState {
  const subscribe = useCallback((onStoreChange: () => void) => {
    listeners.add(onStoreChange);
    return () => {
      listeners.delete(onStoreChange);
    };
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER_STATE
  );
}

export function useWorkspaceEndPaneTarget(): HTMLElement | null {
  return useWorkspaceEndPaneState().element;
}

export function useWorkspaceEndPaneExpanded(): boolean {
  return useWorkspaceEndPaneState().expandedBy.size > 0;
}

export function useWorkspaceEndPaneCount(): number {
  return useWorkspaceEndPaneState().panes.length;
}

/** Where one pane sits in the stack, and the current split. */
export function useWorkspaceEndPaneSlot(key: string): {
  count: number;
  index: number;
  splitPct: number;
} {
  const { panes, splitPct } = useWorkspaceEndPaneState();
  return { count: panes.length, index: panes.indexOf(key), splitPct };
}

export function getWorkspaceEndPaneElement(): HTMLElement | null {
  return state.element;
}
