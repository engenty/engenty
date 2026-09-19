/**
 * Copilot surfaces stay below Radix modal/sheet (`z-50`) so overlays cover the widget
 * visually and match hit-testing.
 */
export const COPILOT_Z_SNAP_HINT = 35;
export const COPILOT_Z_SURFACE = 40;

export const FLOATING_DEFAULT_MARGIN = 16;
export const FLOATING_MIN_WIDTH = 320;
export const FLOATING_MAX_WIDTH = 960;
export const FLOATING_MIN_HEIGHT = 320;
export const FLOATING_MAX_HEIGHT = 760;
export const FLOATING_DEFAULT_WIDTH = 420;
export const FLOATING_DEFAULT_HEIGHT = 480;
export const COMPACT_LAUNCHER_WIDTH = 380;
export const COMPACT_LAUNCHER_HEIGHT = 148;
/** Default expanded status-flap body height (matches prior `max-h-56`). */
export const COMPACT_STATUS_FLAP_DEFAULT_HEIGHT = 224;
export const COMPACT_STATUS_FLAP_MIN_HEIGHT = 96;
export const COMPACT_STATUS_FLAP_MAX_HEIGHT = 480;
export const SIDEBAR_WIDTH = 420;
/** Bottom snap-indicator height (legacy dock card). */
export const BOTTOM_DOCK_WIDGET_HEIGHT = 82;
/** Gap from main content bottom to snap indicator. */
export const BOTTOM_DOCK_BOTTOM_GAP = 12;
/** Max width of the bottom snap indicator. */
export const BOTTOM_DOCK_MAX_WIDTH = 896;
export const BOTTOM_DOCK_SNAP_INDICATOR_HEIGHT = BOTTOM_DOCK_WIDGET_HEIGHT;
export const ATTACH_THRESHOLD = 80;
export const BOTTOM_DOCK_SNAP_THRESHOLD = 96;
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
/** Nudge the topbar trigger upward so it extends above the topbar row. */
export const BUTTON_SNAP_FAB_TOP_OFFSET = 6;
/** App topbar row — default and contentBlend are both 44px (`h-11`). */
export const TOPBAR_DEFAULT_HEIGHT = 44;
export const TOPBAR_CONTENT_BLEND_HEIGHT = 44;
