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
