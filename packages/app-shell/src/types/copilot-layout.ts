/** Shell layout constants shared with copilot chrome (no @engenty/ai-ui import — breaks Turbo cycle). */

/** Bottom composer card height (measured) + gap from main content bottom. */
export const COPILOT_BOTTOM_DOCK_HEIGHT = 94;

/**
 * The same clearance as a CSS length, plus the bottom safe-area inset, so a
 * pinned composer clears the home indicator too. Identical to
 * `COPILOT_BOTTOM_DOCK_HEIGHT` wherever the inset is 0px (all desktop).
 */
export const COPILOT_BOTTOM_DOCK_CLEARANCE = `calc(${COPILOT_BOTTOM_DOCK_HEIGHT}px + var(--ui-safe-bottom, 0px))`;

/**
 * Bottom inset for a main-area scroller so the last content can clear the
 * collapsed copilot FAB (`60px` blob + `16px` inset + `20px` breathing).
 * Keep in lockstep with `--ui-scroll-safe-bottom` in design-tokens.
 */
export const UI_SCROLL_SAFE_BOTTOM_PX = 96;

/**
 * Safe-area-aware forms of the scroller inset, for the shell's inline
 * `--ui-scroll-safe-bottom` override. Writing the bare px value there would
 * discard the inset that the root token (ui-canvas-chrome.css) folds in.
 */
export const UI_SCROLL_SAFE_BOTTOM = `calc(${UI_SCROLL_SAFE_BOTTOM_PX}px + var(--ui-safe-bottom, 0px))`;

/** Reduced inset used while the bottom dock already reserves space below main. */
export const UI_SCROLL_SAFE_BOTTOM_DOCKED =
  "calc(2.5rem + var(--ui-safe-bottom, 0px))";

export const COPILOT_LAYOUT_USER_SETTING_NAME = "copilot.layout";

export type CopilotPersistedPanelMode = "docked" | "floating";

/** Dock modes aligned with `CopilotDockMode` in copilot-shell. */
export type CopilotLayoutPersistDockMode =
  | "floating"
  | "mini-floating"
  | "window"
  | "drawer"
  | "sidebar"
  | "bottom";

/** Where the `window` dock mode sits and how big it is, in viewport px. */
export interface CopilotWindowRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

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
  /** Expanded status-flap content height (px) on compact floating/dock surfaces. */
  compactStatusFlapHeight?: number;
  /** Edge anchor for a FAB dragged away from the default corner. */
  fabAnchor?: CopilotFabAnchor;
  /** Legacy absolute FAB position (superseded by `fabAnchor`). */
  fabPosition?: { x: number; y: number };
  /**
   * When true, the floating launcher re-pins to the bottom-right corner as its
   * measured height settles. Cleared after the user drags it away.
   */
  floatingDockedToCorner?: boolean;
  floatingPosition?: { x: number; y: number };
  floatingSize?: { height: number; width: number };
  open: boolean;
  panelMode?: CopilotPersistedPanelMode;
  preferredDockMode: CopilotLayoutPersistDockMode | null;
  v: 1;
  /** Last position and size of the `window` dock mode. */
  windowRect?: CopilotWindowRect;
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
