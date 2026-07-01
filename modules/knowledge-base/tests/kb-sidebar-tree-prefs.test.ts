import { describe, expect, it } from "vitest";
import { clampSidebarMaxPerLevel } from "../src/schema/kb-sidebar-article-tree.js";
import { kbSidebarNavStorageKey } from "../ui/components/kb-sidebar/lib/tree-prefs.js";

describe("kbSidebarNavStorageKey", () => {
  it("scopes by tenant and user with fallbacks", () => {
    expect(kbSidebarNavStorageKey(null, null)).toBe(
      "engenty.kb.sidebarNav.default.anonymous"
    );
    expect(kbSidebarNavStorageKey("t1", "u1")).toBe(
      "engenty.kb.sidebarNav.t1.u1"
    );
  });
});

describe("clampSidebarMaxPerLevel", () => {
  it("clamps to 3..100", () => {
    expect(clampSidebarMaxPerLevel(2)).toBe(3);
    expect(clampSidebarMaxPerLevel(3)).toBe(3);
    expect(clampSidebarMaxPerLevel(20)).toBe(20);
    expect(clampSidebarMaxPerLevel(100)).toBe(100);
    expect(clampSidebarMaxPerLevel(101)).toBe(100);
  });
});
