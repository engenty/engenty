import type { AppBarPosition } from "@engenty/app-shell";
import { BUTTON_SNAP_FAB_SIZE } from "./copilot-drawer-constants";

/** Speed dial circle size (px). */
export const DIAL_BUTTON_SIZE = 36;
/** Gap between stacked items (px). */
export const DIAL_GAP = 8;
/** Gap from the blob into the canvas so dials clear the app bar. */
export const DIAL_CLEARANCE_PX = 10;
/** Gap between the blob and the first dial along the stack. */
const DIAL_STACK_GAP_PX = 16;

export type FabDialLabelSide = "left" | "right";

export interface FabDialPosition {
  labelSide: FabDialLabelSide;
  x: number;
  y: number;
}

type FabRect = Pick<
  DOMRect,
  "bottom" | "height" | "left" | "right" | "top" | "width"
>;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Place speed-dial buttons in the canvas, not on the app bar.
 * `dock` is the app-bar edge when the blob is docked; `null` is the mobile corner FAB.
 */
export function computeDialPositions(input: {
  count: number;
  dock: AppBarPosition | null;
  fab: FabRect;
  viewport?: { height: number; width: number };
}): FabDialPosition[] {
  const vw = input.viewport?.width ?? 1200;
  const vh = input.viewport?.height ?? 800;
  const { count, dock, fab } = input;
  const margin = 8;
  const itemStep = DIAL_BUTTON_SIZE + DIAL_GAP;
  const fabCenterX = fab.left + fab.width / 2;
  const fabCenterY = fab.top + fab.height / 2;
  const maxX = vw - DIAL_BUTTON_SIZE - margin;
  const maxY = vh - DIAL_BUTTON_SIZE - margin;

  // Labels go into the canvas / toward the larger remaining space — never
  // further off the near viewport edge. Top-bar blob is at the strip's end.
  const labelSide: FabDialLabelSide = fabCenterX > vw / 2 ? "left" : "right";

  let originX = fabCenterX - DIAL_BUTTON_SIZE / 2;
  let originY = fabCenterY - DIAL_BUTTON_SIZE / 2;
  let stackAbove = true;

  if (dock === "left") {
    originX = fab.right + DIAL_CLEARANCE_PX;
    originY = fab.top - DIAL_STACK_GAP_PX - DIAL_BUTTON_SIZE;
    stackAbove = true;
  } else if (dock === "right") {
    originX = fab.left - DIAL_CLEARANCE_PX - DIAL_BUTTON_SIZE;
    originY = fab.top - DIAL_STACK_GAP_PX - DIAL_BUTTON_SIZE;
    stackAbove = true;
  } else if (dock === "top") {
    originX = fabCenterX - DIAL_BUTTON_SIZE / 2;
    originY = fab.bottom + DIAL_CLEARANCE_PX;
    stackAbove = false;
  } else if (dock === "bottom") {
    originX = fabCenterX - DIAL_BUTTON_SIZE / 2;
    originY = fab.top - DIAL_CLEARANCE_PX - DIAL_BUTTON_SIZE;
    stackAbove = true;
  } else {
    const fabMargin = 24;
    const spaceAbove = fabCenterY - BUTTON_SNAP_FAB_SIZE / 2 - fabMargin;
    const totalHeight = count * DIAL_BUTTON_SIZE + (count - 1) * DIAL_GAP;
    stackAbove = spaceAbove >= totalHeight + margin;
    originY = stackAbove
      ? fab.top - fabMargin - DIAL_BUTTON_SIZE
      : fab.bottom + fabMargin;
  }

  originX = clamp(originX, margin, maxX);

  return Array.from({ length: count }, (_, i) => {
    const y = stackAbove ? originY - i * itemStep : originY + i * itemStep;
    return {
      labelSide,
      x: originX,
      y: clamp(y, margin, maxY),
    };
  });
}
