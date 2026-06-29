import { describe, expect, it } from "vitest";
import {
  clampShellSecondaryNavWidthPx,
  SHELL_SECONDARY_NAV_WIDTH_DEFAULT_PX,
  SHELL_SECONDARY_NAV_WIDTH_MAX_PX,
  SHELL_SECONDARY_NAV_WIDTH_MIN_PX,
} from "./shell-secondary-nav-width";

describe("clampShellSecondaryNavWidthPx", () => {
  it("clamps to min", () => {
    expect(clampShellSecondaryNavWidthPx(10)).toBe(
      SHELL_SECONDARY_NAV_WIDTH_MIN_PX
    );
  });

  it("clamps to max", () => {
    expect(clampShellSecondaryNavWidthPx(900)).toBe(
      SHELL_SECONDARY_NAV_WIDTH_MAX_PX
    );
  });

  it("rounds", () => {
    expect(clampShellSecondaryNavWidthPx(255.4)).toBe(255);
  });

  it("uses default for non-finite", () => {
    expect(clampShellSecondaryNavWidthPx(Number.NaN)).toBe(
      SHELL_SECONDARY_NAV_WIDTH_DEFAULT_PX
    );
  });
});
