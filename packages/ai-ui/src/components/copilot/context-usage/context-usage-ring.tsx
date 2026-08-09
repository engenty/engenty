"use client";

import { cn } from "@engenty/ui-core";
import {
  type ContextUsageLevel,
  contextUsageLevel,
  contextUsageRatio,
  formatContextUsageLabel,
  type ThreadContextUsage,
} from "./context-usage-model.js";

const TRACK_CLASS = "stroke-muted";

const ARC_CLASS: Record<ContextUsageLevel, string> = {
  critical: "stroke-destructive",
  high: "stroke-amber-500",
  normal: "stroke-primary",
};

export interface ContextUsageRingProps {
  className?: string;
  /** Outer size in px. */
  size?: number;
  usage: ThreadContextUsage | null;
}

/**
 * Context-window fill as a small donut — the at-a-glance companion to the
 * numeric usage line.
 *
 * Renders nothing when the model's window is unknown: a ring with no
 * denominator would either sit permanently empty or need an invented one, and
 * both misinform. The numbers stay visible in that case; only the ring drops.
 */
export function ContextUsageRing({
  className,
  size = 16,
  usage,
}: ContextUsageRingProps) {
  const ratio = usage ? contextUsageRatio(usage) : null;
  if (!usage || ratio == null) {
    return null;
  }

  const level = contextUsageLevel(usage);
  // Geometry in a fixed 16-unit viewBox, scaled by `size` — keeps the stroke
  // proportional at any size instead of hairlining when the ring shrinks.
  const radius = 6;
  const circumference = 2 * Math.PI * radius;
  // Clamped: a stale catalog window can be smaller than the prompt, and an arc
  // longer than the circle would wrap and read as *less* full than it is.
  const filled = Math.min(1, ratio) * circumference;

  return (
    <svg
      aria-label={`Context window ${formatContextUsageLabel(usage)}`}
      className={cn("shrink-0", className)}
      height={size}
      role="img"
      viewBox="0 0 16 16"
      width={size}
    >
      <circle
        className={TRACK_CLASS}
        cx="8"
        cy="8"
        fill="none"
        r={radius}
        strokeWidth="2.5"
      />
      <circle
        className={ARC_CLASS[level]}
        cx="8"
        cy="8"
        fill="none"
        r={radius}
        strokeDasharray={`${filled} ${circumference}`}
        strokeLinecap="round"
        strokeWidth="2.5"
        // Start the arc at 12 o'clock and run clockwise, like every other
        // progress dial; SVG circles start at 3 o'clock.
        transform="rotate(-90 8 8)"
      />
    </svg>
  );
}
