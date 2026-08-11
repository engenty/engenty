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
  /**
   * Draw the empty track when there is nothing to measure yet, instead of
   * rendering nothing. For the composer, where a fresh thread otherwise left a
   * bare "0" on the line with no shape around it — which reads as broken.
   * Still draws NO arc: an empty ring claims no denominator.
   */
  emptyPlaceholder?: boolean;
  /** Outer size in px. */
  size?: number;
  usage: ThreadContextUsage | null;
}

/**
 * Context-window fill as a small donut — the at-a-glance companion to the
 * numeric usage line.
 *
 * Renders nothing when the model's window is unknown (unless asked for the
 * placeholder): a ring with a filled arc but no denominator would either sit
 * permanently empty or need an invented one, and both misinform.
 */
export function ContextUsageRing({
  className,
  emptyPlaceholder = false,
  size = 16,
  usage,
}: ContextUsageRingProps) {
  const ratio = usage ? contextUsageRatio(usage) : null;
  if (!usage || ratio == null) {
    if (!emptyPlaceholder) {
      return null;
    }
    return (
      <svg
        aria-label="No token usage recorded yet"
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
          r="6"
          strokeWidth="2.5"
        />
      </svg>
    );
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
