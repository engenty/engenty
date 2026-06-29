import { describe, expect, it } from "vitest";
import { clampPaneWidthPx } from "./persisted-pane-width";

describe("clampPaneWidthPx", () => {
  it("clamps to bounds", () => {
    expect(clampPaneWidthPx(10, 100, 200, 150)).toBe(100);
    expect(clampPaneWidthPx(900, 100, 200, 150)).toBe(200);
  });

  it("rounds", () => {
    expect(clampPaneWidthPx(155.4, 100, 200, 150)).toBe(155);
  });

  it("uses fallback when px is not finite", () => {
    expect(clampPaneWidthPx(Number.NaN, 100, 200, 150)).toBe(150);
  });
});
