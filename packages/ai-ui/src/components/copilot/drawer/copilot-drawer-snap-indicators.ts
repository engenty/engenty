import type { CSSProperties } from "react";
import {
  BUTTON_SNAP_FAB_INSET,
  BUTTON_SNAP_FAB_SIZE,
  BUTTON_SNAP_FAB_WIDTH,
  COPILOT_Z_SNAP_HINT,
} from "./copilot-drawer-constants";

export function resolveFabTriggerAnchorStyle(): CSSProperties | null {
  if (typeof window === "undefined") {
    return null;
  }

  const left =
    window.innerWidth - BUTTON_SNAP_FAB_INSET - BUTTON_SNAP_FAB_WIDTH;
  const top = window.innerHeight - BUTTON_SNAP_FAB_INSET - BUTTON_SNAP_FAB_SIZE;

  return {
    position: "fixed",
    left,
    top,
    width: BUTTON_SNAP_FAB_WIDTH,
    height: BUTTON_SNAP_FAB_SIZE,
    zIndex: COPILOT_Z_SNAP_HINT + 5,
  };
}
