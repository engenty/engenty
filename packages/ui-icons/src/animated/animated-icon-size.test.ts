import { describe, expect, it } from "vitest";
import {
  animatedIconSizeClassName,
  resolveAnimatedIconPixelSize,
} from "./animated-icon-size";

describe("animated icon size", () => {
  it("maps tokens to design pixel sizes", () => {
    expect(resolveAnimatedIconPixelSize("xs")).toBe(14);
    expect(resolveAnimatedIconPixelSize("sm")).toBe(16);
    expect(resolveAnimatedIconPixelSize("md")).toBe(20);
    expect(resolveAnimatedIconPixelSize("lg")).toBe(24);
  });

  it("passes through explicit pixel size", () => {
    expect(resolveAnimatedIconPixelSize(32)).toBe(32);
  });

  it("maps tokens to tailwind size classes", () => {
    expect(animatedIconSizeClassName("sm")).toContain("size-4");
  });
});
