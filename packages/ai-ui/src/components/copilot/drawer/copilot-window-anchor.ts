/** App-bar edge the Engenty trigger sits on. */
export type CopilotTriggerEdge = "bottom" | "left" | "right" | "top";

export interface CopilotTriggerBox {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

/** Air between the trigger and the window, matching the viewport clamp margin. */
export const COPILOT_WINDOW_ANCHOR_GAP = 12;

/**
 * First placement of the copilot window: beside the Engenty trigger, opening
 * into the page and away from the app bar.
 *
 * Vertical bars keep the blob at the bottom, so the window pops out beside
 * and just above it: its bottom edge sits a gap above the trigger's top. Horizontal bars keep it at the trailing end, so the
 * window's trailing edge lines up with the trigger.
 */
export function copilotWindowRectBesideTrigger(input: {
  anchor: CopilotTriggerBox;
  position: CopilotTriggerEdge;
  size: { height: number; width: number };
}): { height: number; width: number; x: number; y: number } {
  const { anchor, position, size } = input;
  const gap = COPILOT_WINDOW_ANCHOR_GAP;
  switch (position) {
    case "left":
      return {
        ...size,
        x: anchor.right + gap,
        y: anchor.top - gap - size.height,
      };
    case "right":
      return {
        ...size,
        x: anchor.left - gap - size.width,
        y: anchor.top - gap - size.height,
      };
    case "top":
      return {
        ...size,
        x: anchor.right - size.width,
        y: anchor.bottom + gap,
      };
    case "bottom":
      return {
        ...size,
        x: anchor.right - size.width,
        y: anchor.top - gap - size.height,
      };
    default: {
      const _exhaustive: never = position;
      return _exhaustive;
    }
  }
}
