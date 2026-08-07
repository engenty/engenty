import { useCallback, useSyncExternalStore } from "react";
import type { ThreadContextMode } from "./thread-context-types.js";

/**
 * Coordinates full-page thread context chrome: whether the floating card is
 * inline vs collapsed, and whether the collapsed popover is open. Mirrors
 * the artifact pane store pattern so topbar actions (outside the page
 * React tree via `usePageConfig`) stay in sync with the pane.
 */

interface ThreadContextUiState {
  mode: ThreadContextMode;
  overlayOpen: boolean;
}

const SERVER_STATE: ThreadContextUiState = {
  mode: "hidden",
  overlayOpen: false,
};

let state: ThreadContextUiState = SERVER_STATE;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function setState(next: ThreadContextUiState) {
  if (next.mode === state.mode && next.overlayOpen === state.overlayOpen) {
    return;
  }
  state = next;
  emit();
}

export function setThreadContextMode(mode: ThreadContextMode) {
  // Closing the inline surface also dismisses a stale overlay.
  setState({
    mode,
    overlayOpen: mode === "collapsed" ? state.overlayOpen : false,
  });
}

export function setThreadContextOverlayOpen(open: boolean) {
  setState({ ...state, overlayOpen: open });
}

export function openThreadContextOverlay() {
  setThreadContextOverlayOpen(true);
}

export function clearThreadContextUiForTests() {
  state = SERVER_STATE;
  emit();
}

function useThreadContextUiState(): ThreadContextUiState {
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

export function useThreadContextUi() {
  const { mode, overlayOpen } = useThreadContextUiState();
  return {
    mode,
    overlayOpen,
    setMode: setThreadContextMode,
    setOverlayOpen: setThreadContextOverlayOpen,
    openOverlay: openThreadContextOverlay,
  };
}
