"use client";

import { cn } from "@engenty/ui-core";
import { createPortal } from "react-dom";
import {
  COPILOT_COLLAPSE_MORPH_MS,
  type CopilotCollapseMorphTransform,
} from "./copilot-drawer-collapse-morph";

export function CopilotDrawerCollapseMorphLayer({
  morph,
  phase,
}: {
  morph: CopilotCollapseMorphTransform;
  phase: "animating" | "start";
}) {
  if (typeof document === "undefined") {
    return null;
  }

  const animating = phase === "animating";

  return createPortal(
    <div
      aria-hidden
      className={cn(
        "pointer-events-none fixed overflow-hidden rounded-lg bg-card shadow-[var(--e-3)]",
        "transition-[transform,opacity] ease-in-out",
        animating ? "opacity-0" : "opacity-100"
      )}
      data-copilot-collapse-morph
      style={{
        height: morph.height,
        left: morph.left,
        top: morph.top,
        transform: animating
          ? `translate(${morph.translateX}px, ${morph.translateY}px) scale(${morph.scaleX}, ${morph.scaleY})`
          : "none",
        transformOrigin: "center center",
        transitionDuration: `${COPILOT_COLLAPSE_MORPH_MS}ms`,
        width: morph.width,
        zIndex: 55,
      }}
    />,
    document.body,
    "copilot-drawer-collapse-morph"
  );
}
