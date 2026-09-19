import { APP_BAR_COMPACT_THICKNESS_PX } from "../../types/shell-app-bar-position";

/** Default width for docked copilot sidebar (px). */
export const COPILOT_SIDEBAR_DEFAULT_WIDTH = 420;
export const COPILOT_SIDEBAR_MIN_WIDTH = 320;
export const COPILOT_SIDEBAR_MAX_WIDTH = 720;

/** After collapsing pinned module nav, ignore hover preview briefly so the pointer
 *  does not land on the topbar open control and immediately reopen the overlay. */
export const SECONDARY_NAV_HOVER_PREVIEW_SUPPRESS_MS = 400;

/** Pinned secondary column width animation. Topbar collapsed chrome waits this
 *  out so Open / the space crumb do not appear beside a drawer that is still
 *  on screen. */
export const SECONDARY_NAV_WIDTH_TRANSITION_MS = 300;

/** Compact primary rail width (px). Matches desktop `AppSidebar` compact mode. */
export const COMPACT_SIDEBAR_WIDTH_PX = APP_BAR_COMPACT_THICKNESS_PX;

/** Compact primary rail (matches `COMPACT_SIDEBAR_WIDTH_PX`). */
export const MOBILE_NAV_RAIL_WIDTH_CLASS = "w-14";
