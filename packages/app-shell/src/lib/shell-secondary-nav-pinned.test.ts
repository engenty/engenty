import { describe, expect, it } from "vitest";
import {
  createDefaultShellSecondaryNavPinnedSnapshot,
  parseShellSecondaryNavPinnedSnapshot,
} from "../types/shell-secondary-nav-pinned.js";

describe("parseShellSecondaryNavPinnedSnapshot", () => {
  it("accepts v1 boolean pinnedOpen", () => {
    expect(
      parseShellSecondaryNavPinnedSnapshot({ v: 1, pinnedOpen: false })
    ).toEqual({ v: 1, pinnedOpen: false });
  });

  it("rejects invalid shapes", () => {
    expect(parseShellSecondaryNavPinnedSnapshot(null)).toBeNull();
    expect(
      parseShellSecondaryNavPinnedSnapshot({ v: 2, pinnedOpen: true })
    ).toBe(null);
    expect(
      parseShellSecondaryNavPinnedSnapshot({ v: 1, pinnedOpen: "yes" })
    ).toBeNull();
  });
});

describe("createDefaultShellSecondaryNavPinnedSnapshot", () => {
  it("defaults pinned open", () => {
    expect(createDefaultShellSecondaryNavPinnedSnapshot()).toEqual({
      v: 1,
      pinnedOpen: true,
    });
  });
});
