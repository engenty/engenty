import { usePersistedEwResizePaneWidth } from "../../hooks/use-persisted-ew-resize-pane-width";

/** The workspace end-pane column's persisted width — shared by every pane in it. */
export function useWorkspaceEndPaneWidth() {
  return usePersistedEwResizePaneWidth({
    defaultPx: 480,
    invert: true,
    maxPx: 880,
    minPx: 320,
    storageKey: "engenty.workspace_end_pane.width_px",
  });
}
