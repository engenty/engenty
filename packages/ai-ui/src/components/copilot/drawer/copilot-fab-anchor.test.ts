import { describe, expect, it } from "vitest";
import {
  computeFabAnchor,
  defaultFabAnchor,
  resolveFabAnchorPosition,
} from "./copilot-fab-anchor";

const SIZE = { width: 72, height: 60 };

describe("copilot fab anchor", () => {
  it("anchors a bottom-right FAB and keeps it there when the window grows", () => {
    const viewport = { width: 1000, height: 800 };
    // FAB tucked into the bottom-right corner (16px inset).
    const pos = { x: 1000 - 72 - 16, y: 800 - 60 - 16 };
    const anchor = computeFabAnchor(pos, SIZE, viewport);
    expect(anchor).toEqual({
      edgeX: "right",
      edgeY: "bottom",
      offsetX: 16,
      offsetY: 16,
    });

    const grown = resolveFabAnchorPosition(
      anchor,
      SIZE,
      { width: 1600, height: 1200 },
      16
    );
    // Still 16px from the right/bottom edges of the larger viewport.
    expect(grown).toEqual({ x: 1600 - 72 - 16, y: 1200 - 60 - 16 });
  });

  it("anchors a top-left FAB to the left/top edges", () => {
    const anchor = computeFabAnchor({ x: 24, y: 40 }, SIZE, {
      width: 1000,
      height: 800,
    });
    expect(anchor).toEqual({
      edgeX: "left",
      edgeY: "top",
      offsetX: 24,
      offsetY: 40,
    });
    const resolved = resolveFabAnchorPosition(
      anchor,
      SIZE,
      { width: 500, height: 500 },
      16
    );
    expect(resolved).toEqual({ x: 24, y: 40 });
  });

  it("clamps back into view when the viewport shrinks below the offset", () => {
    const anchor = computeFabAnchor({ x: 900, y: 700 }, SIZE, {
      width: 1000,
      height: 800,
    });
    const resolved = resolveFabAnchorPosition(
      anchor,
      SIZE,
      { width: 300, height: 300 },
      16
    );
    expect(resolved.x).toBeGreaterThanOrEqual(16);
    expect(resolved.y).toBeGreaterThanOrEqual(16);
    expect(resolved.x).toBeLessThanOrEqual(300 - 72 - 16 + 0.0001 + 72);
  });

  it("defaultFabAnchor is the bottom-right corner at the given inset", () => {
    const anchor = defaultFabAnchor(16);
    expect(anchor).toEqual({
      edgeX: "right",
      edgeY: "bottom",
      offsetX: 16,
      offsetY: 16,
    });
    const resolved = resolveFabAnchorPosition(
      anchor,
      SIZE,
      {
        width: 1000,
        height: 800,
      },
      16
    );
    expect(resolved).toEqual({ x: 1000 - 72 - 16, y: 800 - 60 - 16 });
  });
});
