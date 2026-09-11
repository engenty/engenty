import { describe, expect, it } from "vitest";
import { visibleInSpace } from "./visibility.js";

describe("visibleInSpace", () => {
  it("shows the space's own rows and global blockers, never global FYI", () => {
    expect(visibleInSpace({ class: "update", space_id: "s1" }, "s1")).toBe(
      true
    );
    expect(visibleInSpace({ class: "update", space_id: "s2" }, "s1")).toBe(
      false
    );
    expect(visibleInSpace({ class: "decision", space_id: null }, "s1")).toBe(
      true
    );
    expect(visibleInSpace({ class: "alert", space_id: null }, "s1")).toBe(true);
    expect(visibleInSpace({ class: "todo", space_id: null }, "s1")).toBe(true);
    expect(visibleInSpace({ class: "update", space_id: null }, "s1")).toBe(
      false
    );
  });
});
