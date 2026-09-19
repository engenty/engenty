import { describe, expect, it } from "vitest";
import { notificationsInSpaceScope, visibleInSpace } from "./visibility.js";

describe("visibleInSpace", () => {
  it("shows only rows stamped with that space", () => {
    expect(visibleInSpace({ space_id: "s1" }, "s1")).toBe(true);
    expect(visibleInSpace({ space_id: "s2" }, "s1")).toBe(false);
    expect(visibleInSpace({ space_id: null }, "s1")).toBe(false);
  });
});

describe("notificationsInSpaceScope", () => {
  const rows = [
    { id: "in", space_id: "s1" },
    { id: "other", space_id: "s2" },
    { id: "tenant", space_id: null },
  ];

  it("returns nothing when the request named no space — never the tenant list", () => {
    expect(notificationsInSpaceScope(rows, undefined)).toEqual([]);
    expect(notificationsInSpaceScope(rows, null)).toEqual([]);
  });

  it("keeps only rows stamped with that space", () => {
    expect(notificationsInSpaceScope(rows, "s1")).toEqual([rows[0]]);
  });
});
