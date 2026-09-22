import { describe, expect, it } from "vitest";
import {
  computeDialPositions,
  computePromptAnchor,
  DIAL_BUTTON_SIZE,
  DIAL_CLEARANCE_PX,
  PROMPT_INPUT_HEIGHT,
  PROMPT_INPUT_WIDTH,
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

describe("computePromptAnchor", () => {
  const fab = {
    bottom: 420,
    height: 56,
    left: 8,
    right: 64,
    top: 364,
    width: 56,
  };
  const bar = {
    bottom: 800,
    height: 800,
    left: 0,
    right: 72,
    top: 0,
    width: 72,
  };
  const viewport = { height: 800, width: 1200 };

  it("clears the whole bar on a left dock, not just the blob", () => {
    const anchor = computePromptAnchor({ bar, dock: "left", fab, viewport });
    expect(anchor.left).toBeGreaterThanOrEqual(bar.right);
  });

  it("sits on the canvas side of a right dock", () => {
    const rightBar = { ...bar, left: 1128, right: 1200 };
    const rightFab = { ...fab, left: 1136, right: 1192 };
    const anchor = computePromptAnchor({
      bar: rightBar,
      dock: "right",
      fab: rightFab,
      viewport,
    });
    expect(anchor.left + PROMPT_INPUT_WIDTH).toBeLessThanOrEqual(rightBar.left);
  });

  it("never leaves the viewport", () => {
    const anchor = computePromptAnchor({
      bar: null,
      dock: null,
      fab: {
        bottom: 799,
        height: 56,
        left: 1180,
        right: 1236,
        top: 743,
        width: 56,
      },
      viewport,
    });
    expect(anchor.left).toBeGreaterThanOrEqual(0);
    expect(anchor.left + PROMPT_INPUT_WIDTH).toBeLessThanOrEqual(
      viewport.width
    );
    expect(anchor.top).toBeGreaterThanOrEqual(0);
    expect(anchor.top + PROMPT_INPUT_HEIGHT).toBeLessThanOrEqual(
      viewport.height
    );
  });
});
