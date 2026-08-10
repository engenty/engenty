/** @vitest-environment happy-dom */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NavigationSection } from "../../types/shell";
import { useSecondaryNavLayout } from "./use-secondary-nav-layout";

// Mock matchMedia
window.matchMedia = vi.fn().mockImplementation((query) => ({
  matches: true,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useLocation: () => ({
    pathname: "/test-path",
    search: "",
  }),
}));

const pageHeaderState = {
  secondaryNavAfterItems: null as unknown,
  secondaryNavAllowPinned: true,
  secondaryNavHeaderSlot: null as unknown,
  secondaryNavSearchResultsOnly: false,
  breadcrumbs: [] as unknown[],
};

vi.mock("@engenty/ui-plugin-sdk", () => ({
  usePageHeader: () => pageHeaderState,
}));

const sectionsWithSecondary: NavigationSection[] = [
  {
    id: "primary",
    label: "Section 1",
    items: [
      {
        icon: () => null,
        id: "item1",
        label: "Item 1",
        to: "/test-path",
        children: [
          {
            label: "Child 1",
            to: "/test-path/child",
          },
        ],
      },
    ],
  },
];

describe("useSecondaryNavLayout - suppressHoverViaClick", () => {
  afterEach(() => {
    vi.useRealTimers();
    pageHeaderState.secondaryNavAllowPinned = true;
    pageHeaderState.secondaryNavAfterItems = null;
    pageHeaderState.secondaryNavHeaderSlot = null;
  });

  it("suppresses hover preview after closing pinned nav, until mouse leaves", () => {
    vi.useFakeTimers();

    const persistence = {
      snapshot: { pinnedOpen: true, v: 1 as const },
      pinnedHydrated: true,
      mergePinned: vi.fn(),
    };

    const { result } = renderHook(() =>
      useSecondaryNavLayout(sectionsWithSecondary, {
        secondaryNavPersistence: persistence,
      })
    );

    // Initial state: pinned open (from persistence snapshot)
    expect(result.current.secondaryNavOpen).toBe(true);

    // 1. Close pinned secondary nav
    act(() => {
      result.current.closeSecondaryNavPinned();
    });

    // It should close
    expect(result.current.secondaryNavOpen).toBe(false);

    // 2. Try to hover-open it immediately
    act(() => {
      result.current.openHoverPanel();
    });

    // Hover overlay should NOT open because it was just closed via click (suppressed)
    expect(result.current.overlayOpen).toBe(false);

    // 3. Mouse leaves (triggering closeHoverPanel/resetting suppression)
    act(() => {
      result.current.closeHoverPanel();
    });

    // Advance timers past the 400ms ignore-hover window
    act(() => {
      vi.advanceTimersByTime(401);
    });

    // 4. Hover-open again
    act(() => {
      result.current.openHoverPanel();
    });

    // Now it should open successfully because suppression was reset and timer expired!
    expect(result.current.overlayOpen).toBe(true);
  });

  it("never pins open when secondaryNavAllowPinned is false", () => {
    pageHeaderState.secondaryNavAllowPinned = false;

    const persistence = {
      snapshot: { pinnedOpen: true, v: 1 as const },
      pinnedHydrated: true,
      mergePinned: vi.fn(),
    };

    const { result } = renderHook(() =>
      useSecondaryNavLayout(sectionsWithSecondary, {
        secondaryNavPersistence: persistence,
      })
    );

    expect(result.current.secondaryNavOpen).toBe(false);
    expect(result.current.secondaryNavAllowPinned).toBe(false);

    act(() => {
      result.current.setSecondaryNavOpen(true);
    });
    expect(result.current.secondaryNavOpen).toBe(false);
    expect(persistence.mergePinned).not.toHaveBeenCalled();

    act(() => {
      result.current.pinSecondaryNavFromHover();
    });
    expect(result.current.secondaryNavOpen).toBe(false);
    expect(persistence.mergePinned).not.toHaveBeenCalled();
  });

  it("omits page slots when hovering a foreign dock item with children", () => {
    vi.useFakeTimers();
    pageHeaderState.secondaryNavAfterItems = "thread-list";
    pageHeaderState.secondaryNavHeaderSlot = "module-header";

    const persistence = {
      snapshot: { pinnedOpen: false, v: 1 as const },
      pinnedHydrated: true,
      mergePinned: vi.fn(),
    };

    const { result } = renderHook(() =>
      useSecondaryNavLayout(sectionsWithSecondary, {
        secondaryNavPersistence: persistence,
      })
    );

    expect(result.current.overlayIncludePageSlots).toBe(true);
    expect(result.current.hoveredNavItem).toBe(null);

    const settingsItem = {
      id: "settings",
      label: "Settings",
      to: "/settings",
      icon: (() => null) as never,
      children: [
        { to: "/settings/appearance", label: "Appearance" },
        { to: "/settings/ai", label: "AI" },
      ],
    };

    act(() => {
      result.current.openNavItemHover(settingsItem);
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.overlayIncludePageSlots).toBe(false);
    expect(result.current.hoveredNavItem?.label).toBe("Settings");
    expect(result.current.overlayLinkList).toEqual(settingsItem.children);
  });
});
