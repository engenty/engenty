import { describe, expect, it } from "vitest";
import { clampFloatingPositionToViewport } from "./copilot-floating-bounds";

describe("clampFloatingPositionToViewport", () => {
  it("keeps an already visible position unchanged", () => {
    expect(
      clampFloatingPositionToViewport({
        x: 100,
        y: 120,
        margin: 16,
        surfaceWidth: 420,
        surfaceHeight: 480,
        viewportWidth: 1400,
        viewportHeight: 900,
      })
    ).toEqual({ x: 100, y: 120 });
  });

  it("repositions a surface that overflows the right and bottom edges", () => {
    expect(
      clampFloatingPositionToViewport({
        x: 1200,
        y: 900,
        margin: 16,
        surfaceWidth: 420,
        surfaceHeight: 480,
        viewportWidth: 1280,
        viewportHeight: 800,
      })
    ).toEqual({ x: 844, y: 304 });
  });

  it("pins to the margin when the surface is larger than the viewport", () => {
    expect(
      clampFloatingPositionToViewport({
        x: -200,
        y: -100,
        margin: 16,
        surfaceWidth: 900,
        surfaceHeight: 700,
        viewportWidth: 640,
        viewportHeight: 480,
      })
    ).toEqual({ x: 16, y: 16 });
  });
});
