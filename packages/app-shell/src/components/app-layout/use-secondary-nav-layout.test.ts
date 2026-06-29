/** @vitest-environment happy-dom */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

vi.mock("@engenty/ui-plugin-sdk", () => ({
  usePageHeader: () => ({
    secondaryNavAfterItems: null,
    secondaryNavHeaderSlot: null,
    secondaryNavSearchResultsOnly: false,
    breadcrumbs: [],
  }),
}));

describe("useSecondaryNavLayout - suppressHoverViaClick", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("suppresses hover preview after closing pinned nav, until mouse leaves", () => {
    vi.useFakeTimers();

    const sections = [
      {
        id: "section1",
        label: "Section 1",
        items: [
          {
            id: "item1",
            label: "Item 1",
            to: "/test-path",
            children: [
              {
                id: "child1",
                label: "Child 1",
                to: "/test-path/child",
              },
            ],
          },
        ],
      },
    ];

    const persistence = {
      snapshot: { pinnedOpen: true },
      pinnedHydrated: true,
      mergePinned: vi.fn(),
    };

    const { result } = renderHook(() =>
      useSecondaryNavLayout(sections, { secondaryNavPersistence: persistence })
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
});
