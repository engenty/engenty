import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether the browser pane in the workspace end-pane slot is open, and
 * whether it is expanded over the main area. Page-level like the
 * thread-context store: the topbar toggle lives outside the chat's React
 * tree, so both read one module-scoped state.
 */
interface UserBrowserPaneState {
  expanded: boolean;
  open: boolean;
}

const CLOSED: UserBrowserPaneState = { expanded: false, open: false };
let state: UserBrowserPaneState = CLOSED;
const listeners = new Set<() => void>();

function setState(next: UserBrowserPaneState) {
  if (next.open === state.open && next.expanded === state.expanded) {
    return;
  }
  state = next;
  for (const listener of listeners) {
    listener();
  }
}

export function setUserBrowserPaneOpen(open: boolean) {
  setState({ ...state, open });
}

export function setUserBrowserPaneExpanded(expanded: boolean) {
  setState({ ...state, expanded });
}

export function toggleUserBrowserPane() {
  setUserBrowserPaneOpen(!state.open);
}

function useUserBrowserPaneState(): UserBrowserPaneState {
  const subscribe = useCallback((onStoreChange: () => void) => {
    listeners.add(onStoreChange);
    return () => {
      listeners.delete(onStoreChange);
    };
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => CLOSED
  );
}

export function useUserBrowserPaneOpen(): boolean {
  return useUserBrowserPaneState().open;
}

export function useUserBrowserPaneExpanded(): boolean {
  return useUserBrowserPaneState().expanded;
}
