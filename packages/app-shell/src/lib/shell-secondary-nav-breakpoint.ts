/** Viewport at which the module secondary column may stay pinned open (inline width). */
export const SHELL_SECONDARY_NAV_PINNED_MIN_WIDTH_PX = 1025;

/** Pin/hover-preview behavior: ≤1024px collapsed; below `md` (768px) the column is not in layout (burger sheet). */
export const SHELL_SECONDARY_NAV_PINNED_MIN_WIDTH_QUERY =
  `(min-width: ${SHELL_SECONDARY_NAV_PINNED_MIN_WIDTH_PX}px)` as const;

export function isShellSecondaryNavPinnedViewport(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  return window.matchMedia(SHELL_SECONDARY_NAV_PINNED_MIN_WIDTH_QUERY).matches;
}
