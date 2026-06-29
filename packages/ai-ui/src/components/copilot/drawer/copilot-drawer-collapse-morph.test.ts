import { describe, expect, it } from "vitest";
import {
  anchorStyleToMorphRect,
  computeCopilotCollapseMorphTransform,
  domRectToMorphRect,
} from "./copilot-drawer-collapse-morph";

describe("copilot drawer collapse morph", () => {
  it("maps a DOMRect into morph coordinates", () => {
    expect(
      domRectToMorphRect({
        bottom: 600,
        height: 480,
        left: 800,
        right: 1376,
        top: 120,
        width: 576,
        x: 800,
        y: 120,
        toJSON: () => ({}),
      })
    ).toEqual({
      height: 480,
      left: 800,
      top: 120,
      width: 576,
    });
  });

  it("computes transform-only FLIP values from drawer to icon", () => {
    const morph = computeCopilotCollapseMorphTransform(
      { left: 800, top: 120, width: 576, height: 480 },
      { left: 902, top: 2, width: 40, height: 40 }
    );

    expect(morph.left).toBe(800);
    expect(morph.top).toBe(120);
    expect(morph.width).toBe(576);
    expect(morph.height).toBe(480);
    expect(morph.scaleX).toBeCloseTo(40 / 576);
    expect(morph.scaleY).toBeCloseTo(40 / 480);
    expect(morph.translateX).toBeCloseTo(922 - 1088);
    expect(morph.translateY).toBeCloseTo(22 - 360);
  });

  it("reads anchor styles into morph rects", () => {
    expect(
      anchorStyleToMorphRect({
        height: 40,
        left: 902,
        top: 2,
        width: 40,
      })
    ).toEqual({
      height: 40,
      left: 902,
      top: 2,
      width: 40,
    });
    expect(anchorStyleToMorphRect({ left: 1 })).toBeNull();
  });
});
