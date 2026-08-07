"use client";

import { cn } from "@engenty/ui-core";
import { UI_GUIDE_SPOTLIGHT_PADDING_PX } from "./types.js";

export interface TargetRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

export function readTargetRect(el: HTMLElement): TargetRect {
  const rect = el.getBoundingClientRect();
  return {
    height: rect.height,
    width: rect.width,
    x: rect.x,
    y: rect.y,
  };
}

export function SpotlightPanes({
  allowTargetInteraction,
  rect,
}: {
  allowTargetInteraction: boolean;
  rect: TargetRect;
}) {
  const pad = UI_GUIDE_SPOTLIGHT_PADDING_PX;
  const top = Math.max(0, rect.y - pad);
  const left = Math.max(0, rect.x - pad);
  const width = rect.width + pad * 2;
  const height = rect.height + pad * 2;
  const bottom = top + height;
  const right = left + width;
  const dim = "bg-black/40";

  return (
    <>
      <div
        aria-hidden
        className={cn("fixed top-0 right-0 left-0", dim)}
        style={{ height: top }}
      />
      <div
        aria-hidden
        className={cn("fixed right-0 bottom-0 left-0", dim)}
        style={{ top: bottom }}
      />
      <div
        aria-hidden
        className={cn("fixed left-0", dim)}
        style={{ height, top, width: left }}
      />
      <div
        aria-hidden
        className={cn("fixed right-0", dim)}
        style={{ height, left: right, top }}
      />
      {allowTargetInteraction ? null : (
        <div
          aria-hidden
          className="fixed"
          style={{ height, left, top, width }}
        />
      )}
    </>
  );
}

export function HighlightRing({ rect }: { rect: TargetRect }) {
  const pad = UI_GUIDE_SPOTLIGHT_PADDING_PX;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed rounded-md ring-2 ring-primary ring-offset-2 ring-offset-background"
      style={{
        height: rect.height + pad * 2,
        left: Math.max(0, rect.x - pad),
        top: Math.max(0, rect.y - pad),
        width: rect.width + pad * 2,
      }}
    />
  );
}

export function ModalBackdrop() {
  return <div aria-hidden className="fixed inset-0 bg-black/40" />;
}
