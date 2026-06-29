import type { CSSProperties, MutableRefObject } from "react";
import {
  BOTTOM_DOCK_BOTTOM_GAP,
  BOTTOM_DOCK_MAX_WIDTH,
  BOTTOM_DOCK_SNAP_INDICATOR_HEIGHT,
  BUTTON_SNAP_FAB_INSET,
  BUTTON_SNAP_FAB_SIZE,
  BUTTON_SNAP_FAB_TOP_OFFSET,
  BUTTON_SNAP_FAB_WIDTH,
  COPILOT_Z_SNAP_HINT,
  FLOATING_DEFAULT_HEIGHT,
  FLOATING_DEFAULT_WIDTH,
  SIDEBAR_WIDTH,
  TOPBAR_CONTENT_BLEND_HEIGHT,
  TOPBAR_DEFAULT_HEIGHT,
} from "./copilot-drawer-constants";

export function resolveTopbarTriggerAnchorStyle(input?: {
  contentBlend?: boolean;
  topbarTriggerRef?: MutableRefObject<HTMLDivElement | null>;
}): CSSProperties | null {
  if (typeof window === "undefined") {
    return null;
  }

  const slotRect = input?.topbarTriggerRef?.current?.getBoundingClientRect();
  if (slotRect && slotRect.width > 0 && slotRect.height > 0) {
    return {
      position: "fixed",
      left: slotRect.left + (slotRect.width - BUTTON_SNAP_FAB_SIZE) / 2,
      top: slotRect.top - BUTTON_SNAP_FAB_TOP_OFFSET,
      width: BUTTON_SNAP_FAB_SIZE,
      height: BUTTON_SNAP_FAB_SIZE,
      zIndex: COPILOT_Z_SNAP_HINT + 5,
    };
  }

  const topbarHeight = input?.contentBlend
    ? TOPBAR_CONTENT_BLEND_HEIGHT
    : TOPBAR_DEFAULT_HEIGHT;
  return {
    position: "fixed",
    right: BUTTON_SNAP_FAB_INSET,
    top: Math.max(
      BUTTON_SNAP_FAB_TOP_OFFSET,
      topbarHeight / 2 - BUTTON_SNAP_FAB_SIZE / 2
    ),
    width: BUTTON_SNAP_FAB_SIZE,
    height: BUTTON_SNAP_FAB_SIZE,
    zIndex: COPILOT_Z_SNAP_HINT + 5,
  };
}

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

export function resolveBottomDockIndicatorStyle(input: {
  mainContentReady: boolean;
  mainContentRef?: { current: HTMLElement | null };
  margin: number;
}): CSSProperties | null {
  if (typeof window === "undefined") {
    return null;
  }

  const anchorRect =
    input.mainContentReady && input.mainContentRef?.current
      ? input.mainContentRef.current.getBoundingClientRect()
      : null;

  if (anchorRect) {
    const indicatorWidth = Math.min(BOTTOM_DOCK_MAX_WIDTH, anchorRect.width);
    const indicatorLeft =
      anchorRect.left + (anchorRect.width - indicatorWidth) / 2;
    const bottomFromViewportBottom =
      Math.max(0, window.innerHeight - anchorRect.bottom) +
      BOTTOM_DOCK_BOTTOM_GAP;
    const maxIndicatorHeight = Math.max(
      0,
      anchorRect.height - BOTTOM_DOCK_BOTTOM_GAP
    );
    return {
      position: "fixed",
      left: indicatorLeft,
      width: indicatorWidth,
      bottom: bottomFromViewportBottom,
      height: Math.min(BOTTOM_DOCK_SNAP_INDICATOR_HEIGHT, maxIndicatorHeight),
      zIndex: COPILOT_Z_SNAP_HINT,
    };
  }

  const fallbackWidth = Math.min(
    BOTTOM_DOCK_MAX_WIDTH,
    window.innerWidth - input.margin * 2
  );
  return {
    position: "fixed",
    left: (window.innerWidth - fallbackWidth) / 2,
    width: fallbackWidth,
    bottom: input.margin + BOTTOM_DOCK_BOTTOM_GAP,
    height: BOTTOM_DOCK_SNAP_INDICATOR_HEIGHT,
    zIndex: COPILOT_Z_SNAP_HINT,
  };
}

export function resolveSidebarDockIndicatorStyle(
  margin: number
): CSSProperties | null {
  if (typeof window === "undefined") {
    return null;
  }

  return {
    position: "fixed",
    right: margin,
    top: margin,
    bottom: margin,
    width: Math.min(SIDEBAR_WIDTH, window.innerWidth - margin * 2),
    zIndex: COPILOT_Z_SNAP_HINT,
  };
}

export function resolveButtonFabIndicatorStyle(): CSSProperties | null {
  return resolveFabTriggerAnchorStyle();
}

export function resolveFloatingDockIndicatorStyle(
  margin: number
): CSSProperties | null {
  if (typeof window === "undefined") {
    return null;
  }

  const width = Math.min(
    FLOATING_DEFAULT_WIDTH,
    window.innerWidth - margin * 2
  );
  const fabReserve = BUTTON_SNAP_FAB_INSET + BUTTON_SNAP_FAB_SIZE + margin;
  const height = Math.min(
    FLOATING_DEFAULT_HEIGHT,
    window.innerHeight - margin * 2 - TOPBAR_DEFAULT_HEIGHT - fabReserve
  );
  const top = TOPBAR_DEFAULT_HEIGHT + margin;

  return {
    position: "fixed",
    right: margin,
    top,
    width,
    height: Math.max(160, height),
    zIndex: COPILOT_Z_SNAP_HINT,
  };
}
