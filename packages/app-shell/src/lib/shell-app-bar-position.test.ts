import { describe, expect, it } from "vitest";
import { COMPACT_SIDEBAR_WIDTH_PX } from "../components/app-layout/constants.js";
import {
  APP_BAR_COMPACT_THICKNESS_PX,
  APP_BAR_EXTENDED_WIDTH_PX,
  appBarHideTransform,
  appBarThicknessPx,
  appBarTooltipSide,
  createDefaultShellAppBarPositionSnapshot,
  isHorizontalAppBarPosition,
  parseShellAppBarPositionSnapshot,
  shellRootFlexClass,
} from "../types/shell-app-bar-position.js";

describe("parseShellAppBarPositionSnapshot", () => {
  it("accepts v1 edge positions", () => {
    expect(parseShellAppBarPositionSnapshot({ v: 1, position: "top" })).toEqual(
      { v: 1, position: "top" }
    );
    expect(
      parseShellAppBarPositionSnapshot({ v: 1, position: "right" })
    ).toEqual({ v: 1, position: "right" });
  });

  it("rejects invalid shapes", () => {
    expect(parseShellAppBarPositionSnapshot(null)).toBeNull();
    expect(
      parseShellAppBarPositionSnapshot({ v: 2, position: "left" })
    ).toBeNull();
    expect(
      parseShellAppBarPositionSnapshot({ v: 1, position: "center" })
    ).toBeNull();
    expect(parseShellAppBarPositionSnapshot({ v: 1 })).toBeNull();
  });
});

describe("createDefaultShellAppBarPositionSnapshot", () => {
  it("defaults to the left edge", () => {
    expect(createDefaultShellAppBarPositionSnapshot()).toEqual({
      v: 1,
      position: "left",
    });
  });
});

describe("app bar geometry", () => {
  it("treats top and bottom as horizontal", () => {
    expect(isHorizontalAppBarPosition("left")).toBe(false);
    expect(isHorizontalAppBarPosition("right")).toBe(false);
    expect(isHorizontalAppBarPosition("top")).toBe(true);
    expect(isHorizontalAppBarPosition("bottom")).toBe(true);
  });

  it("keeps compact thickness on every edge; extended only widens left/right", () => {
    expect(APP_BAR_COMPACT_THICKNESS_PX).toBe(COMPACT_SIDEBAR_WIDTH_PX);
    expect(appBarThicknessPx("left", "compact")).toBe(
      APP_BAR_COMPACT_THICKNESS_PX
    );
    expect(appBarThicknessPx("left", "extended")).toBe(
      APP_BAR_EXTENDED_WIDTH_PX
    );
    expect(appBarThicknessPx("top", "extended")).toBe(
      APP_BAR_COMPACT_THICKNESS_PX
    );
    expect(appBarThicknessPx("bottom", "compact")).toBe(
      APP_BAR_COMPACT_THICKNESS_PX
    );
  });

  it("slides the bar off its docked edge", () => {
    expect(appBarHideTransform("left", 56)).toBe("translateX(-56px)");
    expect(appBarHideTransform("right", 56)).toBe("translateX(56px)");
    expect(appBarHideTransform("top", 56)).toBe("translateY(-56px)");
    expect(appBarHideTransform("bottom", 56)).toBe("translateY(56px)");
  });

  it("flex-reverses the shell so the bar is still the first child", () => {
    expect(shellRootFlexClass("left")).toBe("flex-row");
    expect(shellRootFlexClass("right")).toBe("flex-row-reverse");
    expect(shellRootFlexClass("top")).toBe("flex-col");
    expect(shellRootFlexClass("bottom")).toBe("flex-col-reverse");
  });

  it("points tooltips toward the content", () => {
    expect(appBarTooltipSide("left")).toBe("right");
    expect(appBarTooltipSide("right")).toBe("left");
    expect(appBarTooltipSide("top")).toBe("bottom");
    expect(appBarTooltipSide("bottom")).toBe("top");
  });
});
