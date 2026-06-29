import type { HTMLAttributes } from "react";

/** Imperative play/stop for loading states and success flashes. */
export interface AnimatedIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

/** Matches common Engenty Lucide sizes (`size-3.5` … `size-6`). */
export type AnimatedIconSize = "xs" | "sm" | "md" | "lg";

/** `hover` (default): animate on pointer enter; `always`: loop while mounted; `controlled`: ref only. */
export type AnimatedIconPlayMode = "hover" | "always" | "controlled";

export interface AnimatedIconBaseProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** Visible label; sets `aria-label` and removes `aria-hidden`. */
  label?: string;
  play?: AnimatedIconPlayMode;
  /** Token size or explicit pixel width/height for the SVG. */
  size?: AnimatedIconSize | number;
}
