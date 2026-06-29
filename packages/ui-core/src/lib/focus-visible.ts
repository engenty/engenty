/**
 * Keyboard focus for bordered controls (inputs, triggers, checkboxes, etc.).
 * Uses a stronger border plus a 1px ring instead of a thick outer halo, while
 * keeping a clear focus-visible indicator (WCAG 2.4.7).
 *
 * Pair with `outline-none` and a base border such as `border border-input`.
 */
export const focusVisibleRingSubtle =
  "focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/45 focus-visible:ring-offset-0";

/**
 * For surfaces without a stroked border (e.g. scroll viewport): thin ring with
 * a small offset so the indicator does not sit on a 3px “glow”.
 */
export const focusVisibleRingOffset =
  "focus-visible:ring-1 focus-visible:ring-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background";
