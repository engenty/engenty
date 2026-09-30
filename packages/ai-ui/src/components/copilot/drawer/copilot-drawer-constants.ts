/**
 * Copilot surfaces stay below Radix modal/sheet (`z-50`) so overlays cover the widget
 * visually and match hit-testing.
 */
export const COPILOT_Z_SNAP_HINT = 35;
/** Default expanded status-flap body height (matches prior `max-h-56`). */
export const COMPACT_STATUS_FLAP_DEFAULT_HEIGHT = 224;
export const COMPACT_STATUS_FLAP_MIN_HEIGHT = 96;
export const COMPACT_STATUS_FLAP_MAX_HEIGHT = 480;
/** Collapsed copilot FAB inset from viewport bottom-right (`right-4 bottom-4`). */
export const BUTTON_SNAP_FAB_INSET = 16;
/** Collapsed copilot FAB height (legacy mobile corner fallback). */
export const BUTTON_SNAP_FAB_SIZE = 60;
/** Collapsed copilot FAB width — the blob base is wider than tall. */
export const BUTTON_SNAP_FAB_WIDTH = 72;
/** Landscape width — the blob silhouette is wider than tall. */
export const DOCKED_FAB_WIDE_SIZE = 61;
/** Short axis: not a packed square. */
export const DOCKED_FAB_SHORT_SIZE = 47;
/** Fill the compact rail on left/right, plus a little peek into the canvas. */
export const DOCKED_FAB_STRIP_SIZE = 58;
