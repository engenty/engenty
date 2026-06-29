import type { CSSProperties } from "react";

/** Drawer panel → bottom-right FAB collapse animation duration. */
export const COPILOT_COLLAPSE_MORPH_MS = 280;

export interface CopilotCollapseMorphRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

export interface CopilotCollapseMorphTransform
  extends CopilotCollapseMorphRect {
  scaleX: number;
  scaleY: number;
  translateX: number;
  translateY: number;
}

export function computeCopilotCollapseMorphTransform(
  from: CopilotCollapseMorphRect,
  to: CopilotCollapseMorphRect
): CopilotCollapseMorphTransform {
  const fromCx = from.left + from.width / 2;
  const fromCy = from.top + from.height / 2;
  const toCx = to.left + to.width / 2;
  const toCy = to.top + to.height / 2;

  return {
    height: from.height,
    left: from.left,
    scaleX: to.width / from.width,
    scaleY: to.height / from.height,
    top: from.top,
    translateX: toCx - fromCx,
    translateY: toCy - fromCy,
    width: from.width,
  };
}

export function domRectToMorphRect(rect: DOMRect): CopilotCollapseMorphRect {
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
}

export function anchorStyleToMorphRect(
  anchor: CSSProperties | null
): CopilotCollapseMorphRect | null {
  if (
    anchor?.left == null ||
    anchor.top == null ||
    anchor.width == null ||
    anchor.height == null
  ) {
    return null;
  }

  return {
    height: Number(anchor.height),
    left: Number(anchor.left),
    top: Number(anchor.top),
    width: Number(anchor.width),
  };
}
