import type { RefObject } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUTTON_SNAP_FAB_INSET,
  BUTTON_SNAP_FAB_SIZE,
  BUTTON_SNAP_FAB_TOP_OFFSET,
  BUTTON_SNAP_FAB_WIDTH,
} from "./copilot-drawer-constants";
import {
  resolveButtonFabIndicatorStyle,
  resolveFabTriggerAnchorStyle,
  resolveFloatingDockIndicatorStyle,
  resolveTopbarTriggerAnchorStyle,
} from "./copilot-drawer-snap-indicators";

describe("copilot fab snap indicators", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      innerWidth: 1280,
      innerHeight: 800,
    });
  });

  it("anchors the topbar trigger below the slot with upward extension", () => {
    const topbarTriggerRef = {
      current: {
        getBoundingClientRect: () => ({
          left: 900,
          top: 8,
          width: 44,
          height: 44,
          right: 944,
          bottom: 52,
          x: 900,
          y: 8,
          toJSON: () => ({}),
        }),
      },
    } as RefObject<HTMLDivElement>;

    const style = resolveTopbarTriggerAnchorStyle({ topbarTriggerRef });
    expect(style).toMatchObject({
      left: 900 + (44 - BUTTON_SNAP_FAB_SIZE) / 2,
      top: 8 - BUTTON_SNAP_FAB_TOP_OFFSET,
      width: BUTTON_SNAP_FAB_SIZE,
      height: BUTTON_SNAP_FAB_SIZE,
    });
  });

  it("anchors the collapsed trigger at the bottom-right inset", () => {
    const style = resolveFabTriggerAnchorStyle();
    expect(style).toMatchObject({
      left: 1280 - BUTTON_SNAP_FAB_INSET - BUTTON_SNAP_FAB_WIDTH,
      top: 800 - BUTTON_SNAP_FAB_INSET - BUTTON_SNAP_FAB_SIZE,
      width: BUTTON_SNAP_FAB_WIDTH,
      height: BUTTON_SNAP_FAB_SIZE,
    });
  });

  it("uses the same rect for the button snap hint", () => {
    expect(resolveButtonFabIndicatorStyle()).toEqual(
      resolveFabTriggerAnchorStyle()
    );
  });

  it("places the floating snap hint in the upper-right band", () => {
    const style = resolveFloatingDockIndicatorStyle(16);
    expect(style?.right).toBe(16);
    expect(style?.top).toBeGreaterThan(52);
    expect(style?.width).toBeGreaterThan(200);
  });
});
