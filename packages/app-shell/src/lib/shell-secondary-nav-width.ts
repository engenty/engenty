import {
  clampPaneWidthPx,
  persistPaneWidthPx,
  readInitialPaneWidthPx,
} from "./persisted-pane-width";

/** Persisted width for the app shell module secondary nav column (px). */
export const SHELL_SECONDARY_NAV_WIDTH_STORAGE_KEY =
  "engenty.shell_secondary_nav.width_px";

export const SHELL_SECONDARY_NAV_WIDTH_MIN_PX = 200;
export const SHELL_SECONDARY_NAV_WIDTH_MAX_PX = 480;
/** Matches previous fixed `w-64` (16rem). */
export const SHELL_SECONDARY_NAV_WIDTH_DEFAULT_PX = 256;

export function clampShellSecondaryNavWidthPx(px: number): number {
  return clampPaneWidthPx(
    px,
    SHELL_SECONDARY_NAV_WIDTH_MIN_PX,
    SHELL_SECONDARY_NAV_WIDTH_MAX_PX,
    SHELL_SECONDARY_NAV_WIDTH_DEFAULT_PX
  );
}

export function readInitialShellSecondaryNavWidthPx(): number {
  return readInitialPaneWidthPx(
    SHELL_SECONDARY_NAV_WIDTH_STORAGE_KEY,
    SHELL_SECONDARY_NAV_WIDTH_MIN_PX,
    SHELL_SECONDARY_NAV_WIDTH_MAX_PX,
    SHELL_SECONDARY_NAV_WIDTH_DEFAULT_PX
  );
}

export function persistShellSecondaryNavWidthPx(widthPx: number): void {
  persistPaneWidthPx(
    SHELL_SECONDARY_NAV_WIDTH_STORAGE_KEY,
    widthPx,
    SHELL_SECONDARY_NAV_WIDTH_MIN_PX,
    SHELL_SECONDARY_NAV_WIDTH_MAX_PX,
    SHELL_SECONDARY_NAV_WIDTH_DEFAULT_PX
  );
}
