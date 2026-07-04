export interface FloatingBoundsInput {
  margin: number;
  surfaceHeight: number;
  surfaceWidth: number;
  viewportHeight: number;
  viewportWidth: number;
  x: number;
  y: number;
}

export interface FloatingPosition {
  x: number;
  y: number;
}

export function clampFloatingPositionToViewport(
  input: FloatingBoundsInput
): FloatingPosition {
  const {
    x,
    y,
    margin,
    surfaceWidth,
    surfaceHeight,
    viewportWidth,
    viewportHeight,
  } = input;

  const maxX = Math.max(margin, viewportWidth - surfaceWidth - margin);
  const maxY = Math.max(margin, viewportHeight - surfaceHeight - margin);

  return {
    x: Math.max(margin, Math.min(maxX, x)),
    y: Math.max(margin, Math.min(maxY, y)),
  };
}

export interface FloatingResizeInput extends FloatingBoundsInput {
  prevViewportHeight: number;
  prevViewportWidth: number;
}

/**
 * Re-position a floating surface when the viewport changes so it stays pinned
 * to whichever edges it was nearest before the resize. A surface docked to the
 * bottom-right corner keeps its bottom/right gap (tracking the corner) instead
 * of drifting toward the top-left as the window grows.
 */
export function reanchorFloatingPositionToViewport(
  input: FloatingResizeInput
): FloatingPosition {
  const {
    x,
    y,
    margin,
    surfaceWidth,
    surfaceHeight,
    prevViewportWidth,
    prevViewportHeight,
    viewportWidth,
    viewportHeight,
  } = input;

  const gapLeft = x;
  const gapRight = prevViewportWidth - (x + surfaceWidth);
  const gapTop = y;
  const gapBottom = prevViewportHeight - (y + surfaceHeight);

  // Pin to the closer edge on each axis, preserving that edge's gap.
  const nextX =
    gapRight <= gapLeft ? viewportWidth - surfaceWidth - gapRight : gapLeft;
  const nextY =
    gapBottom <= gapTop ? viewportHeight - surfaceHeight - gapBottom : gapTop;

  return clampFloatingPositionToViewport({
    x: nextX,
    y: nextY,
    margin,
    surfaceWidth,
    surfaceHeight,
    viewportWidth,
    viewportHeight,
  });
}
