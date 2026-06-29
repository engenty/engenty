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

export interface CopilotLayoutSnapshotV1 {
  collapseToCircle?: boolean;
  /** Custom FAB position when dragged away from the default corner. */
  fabPosition?: { x: number; y: number };
  floatingPosition?: { x: number; y: number };
  floatingSize?: { width: number; height: number };
  open: boolean;
  panelMode?: CopilotPersistedPanelMode;
  preferredDockMode: CopilotLayoutPersistDockMode | null;
  v: 1;
}

/** Injected by the host (e.g. React Query + user-settings API). */
export interface CopilotLayoutPersistenceApi {
  layoutHydrated: boolean;
  mergeLayout: (patch: Partial<CopilotLayoutSnapshotV1>) => void;
  snapshot: CopilotLayoutSnapshotV1 | null;
}
