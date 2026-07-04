import { describe, expect, it } from "vitest";
import {
  clampFloatingPositionToViewport,
  reanchorFloatingPositionToViewport,
} from "./copilot-floating-bounds";

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

describe("reanchorFloatingPositionToViewport", () => {
  const size = { surfaceWidth: 420, surfaceHeight: 480 };

  it("keeps a bottom-right panel pinned to the corner as the window grows", () => {
    // 16px gap from the right and bottom of a 1280x800 viewport.
    const pos = { x: 1280 - 420 - 16, y: 800 - 480 - 16 };
    const next = reanchorFloatingPositionToViewport({
      ...pos,
      ...size,
      margin: 16,
      prevViewportWidth: 1280,
      prevViewportHeight: 800,
      viewportWidth: 1600,
      viewportHeight: 1000,
    });
    // Still 16px from the right/bottom edges of the larger viewport.
    expect(next).toEqual({ x: 1600 - 420 - 16, y: 1000 - 480 - 16 });
  });

  it("keeps a top-left panel pinned to the top-left edges", () => {
    const next = reanchorFloatingPositionToViewport({
      x: 24,
      y: 40,
      ...size,
      margin: 16,
      prevViewportWidth: 1280,
      prevViewportHeight: 800,
      viewportWidth: 800,
      viewportHeight: 600,
    });
    expect(next).toEqual({ x: 24, y: 40 });
  });
});
