import { useCallback, useSyncExternalStore } from "react";

/**
 * Workspace end-pane slot — a full-height column at the trailing edge of the
 * workspace, OUTSIDE the topbar+main column (the topbar spans only the main
 * area). `AppLayoutFrame` registers the slot element; routes portal pane
 * content (e.g. the copilot artifact pane) into it via
 * `useWorkspaceEndPaneTarget`. The slot is width-less until filled.
 *
 * `expanded` flips the flex roles: the slot takes the whole row and the
 * main column collapses to zero — set it from the route that owns the pane
 * (reset on unmount).
 */
interface WorkspaceEndPaneState {
  element: HTMLElement | null;
  expanded: boolean;
}

const SERVER_STATE: WorkspaceEndPaneState = { element: null, expanded: false };
let state: WorkspaceEndPaneState = SERVER_STATE;
const listeners = new Set<() => void>();

function setState(next: WorkspaceEndPaneState) {
  if (next.element === state.element && next.expanded === state.expanded) {
    return;
  }
  state = next;
  for (const listener of listeners) {
    listener();
  }
}

export function setWorkspaceEndPaneElement(el: HTMLElement | null) {
  setState({ ...state, element: el });
}

export function setWorkspaceEndPaneExpanded(expanded: boolean) {
  setState({ ...state, expanded });
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
  return useWorkspaceEndPaneState().expanded;
}
