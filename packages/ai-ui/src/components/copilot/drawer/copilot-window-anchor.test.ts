import { describe, expect, it } from "vitest";
import { copilotWindowRectBesideTrigger } from "./copilot-window-anchor";

const size = { height: 680, width: 520 };

describe("copilotWindowRectBesideTrigger", () => {
  it("pops out to the right of a left-bar trigger, just above it", () => {
    expect(
      copilotWindowRectBesideTrigger({
        anchor: { bottom: 800, left: 0, right: 56, top: 744 },
        position: "left",
        size,
      })
    ).toEqual({ height: 680, width: 520, x: 68, y: 52 });
  });

  it("pops out to the left of a right-bar trigger, just above it", () => {
    expect(
      copilotWindowRectBesideTrigger({
        anchor: { bottom: 800, left: 1384, right: 1440, top: 744 },
        position: "right",
        size,
      })
    ).toEqual({ height: 680, width: 520, x: 852, y: 52 });
  });

  it("opens under a top-bar trigger, trailing edge aligned", () => {
    expect(
      copilotWindowRectBesideTrigger({
        anchor: { bottom: 56, left: 1360, right: 1424, top: 0 },
        position: "top",
        size,
      })
    ).toEqual({ height: 680, width: 520, x: 904, y: 68 });
  });

  it("opens above a bottom-bar trigger, trailing edge aligned", () => {
    expect(
      copilotWindowRectBesideTrigger({
        anchor: { bottom: 900, left: 1360, right: 1424, top: 844 },
        position: "bottom",
        size,
      })
    ).toEqual({ height: 680, width: 520, x: 904, y: 152 });
  });
});
