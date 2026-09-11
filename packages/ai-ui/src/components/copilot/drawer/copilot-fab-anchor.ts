import type { CopilotFabAnchor } from "@engenty/app-shell";
import { clampFloatingPositionToViewport } from "../session/copilot-floating-bounds";

export type { CopilotFabAnchor } from "@engenty/app-shell";

interface Size {
  height: number;
  width: number;
}

interface Viewport {
  height: number;
  width: number;
}

/**
 * Derive the edge anchor for a FAB at absolute position `pos`. The avatar is
 * pinned to whichever horizontal and vertical edges it currently sits closest
 * to, remembering the gap to each so the corner stays put across resizes.
 */
export function computeFabAnchor(
  pos: { x: number; y: number },
  size: Size,
  viewport: Viewport
): CopilotFabAnchor {
  const distLeft = pos.x;
  const distRight = viewport.width - (pos.x + size.width);
  const distTop = pos.y;
  const distBottom = viewport.height - (pos.y + size.height);

  const edgeX = distRight <= distLeft ? "right" : "left";
  const edgeY = distBottom <= distTop ? "bottom" : "top";

  return {
    edgeX,
    edgeY,
    offsetX: Math.max(0, edgeX === "right" ? distRight : distLeft),
    offsetY: Math.max(0, edgeY === "bottom" ? distBottom : distTop),
  };
}

/**
 * The FAB's logical home: bottom-right corner with a fixed inset. This is the
 * single source of truth for "default position" — there is no separate
 * null/undefined convention for "not customized".
 */
export function defaultFabAnchor(inset: number): CopilotFabAnchor {
  return { edgeX: "right", edgeY: "bottom", offsetX: inset, offsetY: inset };
}

/**
 * After a FAB pointer-up with no snap target: keep the current corner on a
 * click. Committing the leftover `{0,0}` drag seed is what parked the avatar
 * in the top-left corner.
 */
export function resolveFabFreeDropAnchor(input: {
  lastPosition: { x: number; y: number };
  moved: boolean;
  size: Size;
  viewport: Viewport;
}): CopilotFabAnchor | null {
  if (!input.moved) {
    return null;
  }
  return computeFabAnchor(input.lastPosition, input.size, input.viewport);
}

/**
 * Skip layout math when the window has not been sized yet — clamping a
 * bottom-right home into a 0×0 viewport yields the top-left origin.
 */
export function isUsableFabViewport(
  viewport: Viewport,
  size: Size,
  margin: number
): boolean {
  return (
    viewport.width >= size.width + margin * 2 &&
    viewport.height >= size.height + margin * 2
  );
}

/**
 * Resolve an edge anchor back to an absolute, in-viewport position for the
 * current window size.
 */
export function resolveFabAnchorPosition(
  anchor: CopilotFabAnchor,
  size: Size,
  viewport: Viewport,
  margin: number
): { x: number; y: number } {
  const x =
    anchor.edgeX === "right"
      ? viewport.width - size.width - anchor.offsetX
      : anchor.offsetX;
  const y =
    anchor.edgeY === "bottom"
      ? viewport.height - size.height - anchor.offsetY
      : anchor.offsetY;

  return clampFloatingPositionToViewport({
    x,
    y,
    margin,
    surfaceWidth: size.width,
    surfaceHeight: size.height,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
  });
}
