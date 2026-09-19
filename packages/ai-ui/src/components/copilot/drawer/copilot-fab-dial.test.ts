import { describe, expect, it } from "vitest";
import {
  computeDialPositions,
  DIAL_BUTTON_SIZE,
  DIAL_CLEARANCE_PX,
} from "./copilot-fab-dial";

function fabRect(box: {
  height: number;
  left: number;
  top: number;
  width: number;
}): DOMRect {
  const { height, left, top, width } = box;
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    toJSON: () => box,
    top,
    width,
    x: left,
    y: top,
  } as DOMRect;
}

const viewport = { height: 900, width: 1400 };

describe("computeDialPositions", () => {
  it("puts left-rail dials to the right of the blob, into the canvas", () => {
    const fab = fabRect({ height: 47, left: 4, top: 780, width: 58 });
    const [first] = computeDialPositions({
      count: 3,
      dock: "left",
      fab,
      viewport,
    });
    expect(first).toBeDefined();
    expect(first?.x).toBeGreaterThanOrEqual(fab.right + DIAL_CLEARANCE_PX);
    expect(first?.x).toBeGreaterThan(56);
    expect(first?.labelSide).toBe("right");
    expect((first?.y ?? 0) + DIAL_BUTTON_SIZE).toBeLessThanOrEqual(fab.top);
  });

  it("puts right-rail dials to the left of the blob", () => {
    const fab = fabRect({ height: 47, left: 1338, top: 780, width: 58 });
    const [first] = computeDialPositions({
      count: 3,
      dock: "right",
      fab,
      viewport,
    });
    expect(first).toBeDefined();
    expect((first?.x ?? 0) + DIAL_BUTTON_SIZE).toBeLessThanOrEqual(
      fab.left - DIAL_CLEARANCE_PX
    );
    expect(first?.labelSide).toBe("left");
  });

  it("puts top-bar dials below the blob with labels into the canvas", () => {
    const fab = fabRect({ height: 47, left: 1328, top: 15, width: 55 });
    const [first] = computeDialPositions({
      count: 7,
      dock: "top",
      fab,
      viewport,
    });
    expect(first).toBeDefined();
    expect(first?.y).toBeGreaterThanOrEqual(fab.bottom + DIAL_CLEARANCE_PX);
    expect(first?.labelSide).toBe("left");
    expect((first?.x ?? 0) + DIAL_BUTTON_SIZE).toBeLessThanOrEqual(
      viewport.width
    );
  });

  it("puts bottom-bar dials above the blob", () => {
    const fab = fabRect({ height: 47, left: 12, top: 849, width: 61 });
    const [first] = computeDialPositions({
      count: 3,
      dock: "bottom",
      fab,
      viewport,
    });
    expect(first).toBeDefined();
    expect((first?.y ?? 0) + DIAL_BUTTON_SIZE).toBeLessThanOrEqual(
      fab.top - DIAL_CLEARANCE_PX
    );
  });

  it("keeps the mobile corner stack aligned to the blob", () => {
    const fab = fabRect({ height: 60, left: 1312, top: 824, width: 72 });
    const [first] = computeDialPositions({
      count: 2,
      dock: null,
      fab,
      viewport,
    });
    expect(first).toBeDefined();
    expect(first?.x).toBeCloseTo(
      fab.left + fab.width / 2 - DIAL_BUTTON_SIZE / 2
    );
    expect(first?.labelSide).toBe("left");
  });
});
