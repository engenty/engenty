/** Shell layout constants shared with copilot chrome (no @engenty/ai-ui import — breaks Turbo cycle). */

/** Bottom composer card height (measured) + gap from main content bottom. */
export const COPILOT_BOTTOM_DOCK_HEIGHT = 94;

export const COPILOT_LAYOUT_USER_SETTING_NAME = "copilot.layout";

export type CopilotPersistedPanelMode = "docked" | "floating";

/** Dock modes aligned with `CopilotDockMode` in copilot-shell. */
export type CopilotLayoutPersistDockMode =
  | "floating"
  | "mini-floating"
  | "drawer"
  | "sidebar"
  | "bottom";

/**
 * Which viewport edges the FAB avatar is pinned to, plus the gap from each
 * edge. Persisting the anchor (rather than an absolute point) keeps the avatar
 * stuck to its corner across window resizes and reloads.
 */
export interface CopilotFabAnchor {
  edgeX: "left" | "right";
  edgeY: "top" | "bottom";
  /** Distance in px from `edgeX` to the FAB's nearest horizontal edge. */
  offsetX: number;
  /** Distance in px from `edgeY` to the FAB's nearest vertical edge. */
  offsetY: number;
}

export interface CopilotLayoutSnapshotV1 {
  collapseToCircle?: boolean;
  /** Edge anchor for a FAB dragged away from the default corner. */
  fabAnchor?: CopilotFabAnchor;
  /** Legacy absolute FAB position (superseded by `fabAnchor`). */
  fabPosition?: { x: number; y: number };
  floatingPosition?: { x: number; y: number };
  floatingSize?: { width: number; height: number };
  /** Expanded status-flap content height (px) on compact floating/dock surfaces. */
  compactStatusFlapHeight?: number;
  open: boolean;
  panelMode?: CopilotPersistedPanelMode;
  preferredDockMode: CopilotLayoutPersistDockMode | null;
  v: 1;
}

/** `open` + collapsed circle hides all chrome; force expanded when shell is open. */
export function reconcileCopilotLayoutSnapshot(
  snapshot: CopilotLayoutSnapshotV1
): CopilotLayoutSnapshotV1 {
  if (snapshot.open && snapshot.collapseToCircle) {
    return { ...snapshot, collapseToCircle: false };
  }
  return snapshot;
}

/** Injected by the host (e.g. React Query + user-settings API). */
export interface CopilotLayoutPersistenceApi {
  layoutHydrated: boolean;
  mergeLayout: (patch: Partial<CopilotLayoutSnapshotV1>) => void;
  snapshot: CopilotLayoutSnapshotV1 | null;
}
