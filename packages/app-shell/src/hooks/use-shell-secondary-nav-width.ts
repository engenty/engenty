import {
  SHELL_SECONDARY_NAV_WIDTH_DEFAULT_PX,
  SHELL_SECONDARY_NAV_WIDTH_MAX_PX,
  SHELL_SECONDARY_NAV_WIDTH_MIN_PX,
  SHELL_SECONDARY_NAV_WIDTH_STORAGE_KEY,
} from "../lib/shell-secondary-nav-width";
import { usePersistedEwResizePaneWidth } from "./use-persisted-ew-resize-pane-width";

export function useShellSecondaryNavWidth() {
  return usePersistedEwResizePaneWidth({
    defaultPx: SHELL_SECONDARY_NAV_WIDTH_DEFAULT_PX,
    maxPx: SHELL_SECONDARY_NAV_WIDTH_MAX_PX,
    minPx: SHELL_SECONDARY_NAV_WIDTH_MIN_PX,
    storageKey: SHELL_SECONDARY_NAV_WIDTH_STORAGE_KEY,
  });
}
