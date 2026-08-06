import { describe, expect, it } from "vitest";
import {
  isForeignDockSecondaryNavPreview,
  isSecondaryNavHoverOverlayOpen,
  shouldMountSecondaryNavHoverOverlay,
  shouldSkipSecondaryNavPinOpenTransition,
} from "./secondary-nav-hover-overlay";

describe("isForeignDockSecondaryNavPreview", () => {
  it("is false when nothing is hovered", () => {
    expect(isForeignDockSecondaryNavPreview(null)).toBe(false);
  });

  it("is false when hovering the active module without children", () => {
    expect(isForeignDockSecondaryNavPreview({ children: undefined })).toBe(
      false
    );
    expect(isForeignDockSecondaryNavPreview({ children: [] })).toBe(false);
  });

  it("is true when hovering a dock item that owns a child link list", () => {
    expect(
      isForeignDockSecondaryNavPreview({
        children: [{ to: "/settings/appearance", label: "Appearance" }],
      })
    ).toBe(true);
  });
});

describe("shouldMountSecondaryNavHoverOverlay", () => {
  it("mounts for KB-style pages with header slot and no shell links", () => {
    expect(
      shouldMountSecondaryNavHoverOverlay({
        hasSecondaryNav: true,
        secondaryNavOpen: false,
        secondaryNavHoverOpen: false,
        hoveredNavItem: null,
        overlayLinkListLength: 0,
        hasSecondaryNavAfterItems: true,
        hasSecondaryNavHeaderSlot: true,
      })
    ).toBe(true);
  });

  it("mounts when topbar toggle hover opens preview", () => {
    expect(
      shouldMountSecondaryNavHoverOverlay({
        hasSecondaryNav: true,
        secondaryNavOpen: false,
        secondaryNavHoverOpen: true,
        hoveredNavItem: null,
        overlayLinkListLength: 0,
        hasSecondaryNavAfterItems: false,
        hasSecondaryNavHeaderSlot: false,
      })
    ).toBe(true);
  });

  it("does not mount when pinned open", () => {
    expect(
      shouldMountSecondaryNavHoverOverlay({
        hasSecondaryNav: true,
        secondaryNavOpen: true,
        secondaryNavHoverOpen: true,
        hoveredNavItem: null,
        overlayLinkListLength: 3,
        hasSecondaryNavAfterItems: true,
        hasSecondaryNavHeaderSlot: true,
      })
    ).toBe(false);
  });

  it("does not mount when no secondary nav and not hovering item with children", () => {
    expect(
      shouldMountSecondaryNavHoverOverlay({
        hasSecondaryNav: false,
        secondaryNavOpen: false,
        secondaryNavHoverOpen: true,
        hoveredNavItem: null,
        overlayLinkListLength: 0,
        hasSecondaryNavAfterItems: false,
        hasSecondaryNavHeaderSlot: false,
      })
    ).toBe(false);
  });

  it("mounts when hovering an item with children even if current page has no secondary nav", () => {
    expect(
      shouldMountSecondaryNavHoverOverlay({
        hasSecondaryNav: false,
        secondaryNavOpen: false,
        secondaryNavHoverOpen: false,
        hoveredNavItem: { id: "test" },
        overlayLinkListLength: 3,
        hasSecondaryNavAfterItems: false,
        hasSecondaryNavHeaderSlot: false,
      })
    ).toBe(true);
  });
});

describe("isSecondaryNavHoverOverlayOpen", () => {
  it("opens on PanelLeft hover when sidebar is closed", () => {
    expect(
      isSecondaryNavHoverOverlayOpen({
        secondaryNavOpen: false,
        secondaryNavHoverOpen: true,
        hoveredNavItem: null,
      })
    ).toBe(true);
  });

  it("stays closed before hover", () => {
    expect(
      isSecondaryNavHoverOverlayOpen({
        secondaryNavOpen: false,
        secondaryNavHoverOpen: false,
        hoveredNavItem: null,
      })
    ).toBe(false);
  });
});

describe("shouldSkipSecondaryNavPinOpenTransition", () => {
  it("skips width animation when pinning from hover preview", () => {
    expect(
      shouldSkipSecondaryNavPinOpenTransition({
        secondaryNavOpen: false,
        trigger: "hover-pin",
      })
    ).toBe(true);
  });

  it("keeps width animation for topbar toggle open", () => {
    expect(
      shouldSkipSecondaryNavPinOpenTransition({
        secondaryNavOpen: false,
        trigger: "topbar-toggle",
      })
    ).toBe(false);
  });

  it("does not skip when secondary nav is already pinned", () => {
    expect(
      shouldSkipSecondaryNavPinOpenTransition({
        secondaryNavOpen: true,
        trigger: "hover-pin",
      })
    ).toBe(false);
  });
});
