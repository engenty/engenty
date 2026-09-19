/** Shell layout constants shared with copilot chrome (no @engenty/ai-ui import — breaks Turbo cycle). */

/**
 * Mobile corner-FAB inset (`60px` blob + `16px` inset + `20px` breathing).
 * Keep in lockstep with `--ui-scroll-safe-bottom` under `md` in design-tokens.
 * Desktop no longer reserves this hole; Group 3 retires the mobile FAB.
 */
export const UI_SCROLL_SAFE_BOTTOM_PX = 96;

export const COPILOT_LAYOUT_USER_SETTING_NAME = "copilot.layout";

/**
 * Live conversation chrome:
 * - `sidebar` — Work: chat as the side panel
 * - `window` — Work, detached
 * - `drawer` — Work as a sheet (mobile)
 */
export const COPILOT_DOCK_MODES = ["window", "drawer", "sidebar"] as const;
export type CopilotDockMode = (typeof COPILOT_DOCK_MODES)[number];

/** Legacy persisted ids. Hydrate remaps these before they reach live chrome. */
export type CopilotLayoutLegacyDockMode =
  | "floating"
  | "mini-floating"
  | "bottom";

/** Dock modes that may appear in stored `copilot.layout`. */
export type CopilotLayoutPersistDockMode =
  | CopilotDockMode
  | CopilotLayoutLegacyDockMode;

export function isCopilotDockMode(value: unknown): value is CopilotDockMode {
  return value === "window" || value === "drawer" || value === "sidebar";
}

/**
 * Map a stored dock id onto live chrome. `mini-floating` collapses to a closed
 * blob (caller also flips `open`). `bottom` and compact `floating` become Work.
 */
export function remapPersistedDockMode(
  mode: CopilotLayoutPersistDockMode | null | undefined
): CopilotDockMode | null {
  if (mode == null || mode === "mini-floating") {
    return null;
  }
  if (mode === "bottom" || mode === "floating") {
    return "sidebar";
  }
  return mode;
}

/** Where the `window` dock mode sits and how big it is, in viewport px. */
export interface CopilotWindowRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface CopilotLayoutSnapshotV1 {
  collapseToCircle?: boolean;
  /** Expanded status-flap content height (px) on compact surfaces. */
  compactStatusFlapHeight?: number;
  /**
   * When true, a detached window re-pins to the bottom-right corner as its
   * measured height settles. Cleared after the user drags it away.
   */
  floatingDockedToCorner?: boolean;
  floatingPosition?: { x: number; y: number };
  floatingSize?: { height: number; width: number };
  open: boolean;
  preferredDockMode: CopilotLayoutPersistDockMode | null;
  v: 1;
  /** Last position and size of the `window` dock mode. */
  windowRect?: CopilotWindowRect;
}

/**
 * Normalize a stored snapshot for the current chrome:
 * - `open` + collapsed circle hides all chrome; force expanded when shell is open.
 * - `mini-floating` used to mean a wanderable canvas avatar. Collapse now means
 *   the panel is closed and the blob stays on the app bar.
 */
export function reconcileCopilotLayoutSnapshot(
  snapshot: CopilotLayoutSnapshotV1
): CopilotLayoutSnapshotV1 {
  let next = snapshot;
  if (next.preferredDockMode === "mini-floating") {
    next = {
      ...next,
      collapseToCircle: true,
      open: false,
      preferredDockMode: null,
    };
  } else {
    const remapped = remapPersistedDockMode(next.preferredDockMode);
    if (remapped !== next.preferredDockMode) {
      next = { ...next, preferredDockMode: remapped };
    }
    if (next.open && next.collapseToCircle) {
      next = { ...next, collapseToCircle: false };
    }
  }
  return next;
}

/** Injected by the host (e.g. React Query + user-settings API). */
export interface CopilotLayoutPersistenceApi {
  layoutHydrated: boolean;
  mergeLayout: (patch: Partial<CopilotLayoutSnapshotV1>) => void;
  snapshot: CopilotLayoutSnapshotV1 | null;
}
