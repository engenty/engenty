/** Whether the sliding hover column should be mounted (sidebar closed). */
export function shouldMountSecondaryNavHoverOverlay(input: {
  hasSecondaryNav: boolean;
  hasSecondaryNavAfterItems: boolean;
  hasSecondaryNavHeaderSlot: boolean;
  hoveredNavItem: unknown | null;
  overlayLinkListLength: number;
  secondaryNavHoverOpen: boolean;
  secondaryNavOpen: boolean;
}): boolean {
  if (input.secondaryNavOpen) {
    return false;
  }
  // If we are hovering an item that has children, we can always show the hover overlay
  if (input.hoveredNavItem != null && input.overlayLinkListLength > 0) {
    return true;
  }
  // Otherwise, only mount if the current page has a secondary nav
  if (input.hasSecondaryNav) {
    return (
      input.secondaryNavHoverOpen ||
      input.hasSecondaryNavAfterItems ||
      input.hasSecondaryNavHeaderSlot
    );
  }
  return false;
}

/** Whether the hover overlay is slid open (translate-x-0). */
export function isSecondaryNavHoverOverlayOpen(input: {
  hoveredNavItem: unknown | null;
  secondaryNavHoverOpen: boolean;
  secondaryNavOpen: boolean;
}): boolean {
  return (
    input.hoveredNavItem != null ||
    (!input.secondaryNavOpen && input.secondaryNavHoverOpen)
  );
}

/** Skip pinned-column width animation when pinning from an already-open hover preview. */
export function shouldSkipSecondaryNavPinOpenTransition(input: {
  secondaryNavOpen: boolean;
  trigger: "hover-pin" | "topbar-toggle";
}): boolean {
  return input.trigger === "hover-pin" && !input.secondaryNavOpen;
}
