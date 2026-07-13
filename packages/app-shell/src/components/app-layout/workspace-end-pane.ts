import { useCallback, useSyncExternalStore } from "react";

/**
 * Workspace end-pane slot — a full-height column at the trailing edge of the
 * workspace, OUTSIDE the topbar+main column (the topbar spans only the main
 * area). `AppLayoutFrame` registers the slot element; routes portal pane
 * content (e.g. the copilot artifact pane) into it via
 * `useWorkspaceEndPaneTarget`. The slot is width-less until filled.
 */
let element: HTMLElement | null = null;
const listeners = new Set<() => void>();

export function setWorkspaceEndPaneElement(el: HTMLElement | null) {
  if (element === el) {
    return;
  }
  element = el;
  for (const listener of listeners) {
    listener();
  }
}

export function useWorkspaceEndPaneTarget(): HTMLElement | null {
  const subscribe = useCallback((onStoreChange: () => void) => {
    listeners.add(onStoreChange);
    return () => {
      listeners.delete(onStoreChange);
    };
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => element,
    () => null
  );
}
