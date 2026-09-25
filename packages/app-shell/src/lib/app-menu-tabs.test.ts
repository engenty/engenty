import { describe, expect, it } from "vitest";
import { appMenuTabStep, latestAppMenuSpaces } from "./app-menu-tabs";

const space = (id: string, key = id) => ({ id, key, name: id });

describe("latestAppMenuSpaces", () => {
  it("puts the current space first, then recency, then the rest by name", () => {
    const spaces = [space("a"), space("b"), space("c"), space("d")];
    expect(
      latestAppMenuSpaces({
        currentKey: "c",
        recentIds: ["b", "c", "a"],
        spaces,
      }).map((row) => row.id)
    ).toEqual(["c", "b", "a", "d"]);
  });

  it("keeps spaces that were never opened and ignores unknown recency ids", () => {
    const spaces = ["a", "b", "c", "d", "e"].map((id) => space(id));
    expect(
      latestAppMenuSpaces({
        recentIds: ["missing", "e", "c"],
        spaces,
      }).map((row) => row.id)
    ).toEqual(["e", "c", "a", "b", "d"]);
  });
});

describe("appMenuTabStep", () => {
  it("steps when the search caret is at the edge", () => {
    expect(
      appMenuTabStep("ArrowLeft", {
        selectionEnd: 0,
        selectionStart: 0,
        value: "files",
      })
    ).toBe(-1);
    expect(
      appMenuTabStep("ArrowRight", {
        selectionEnd: 5,
        selectionStart: 5,
        value: "files",
      })
    ).toBe(1);
  });

  it("leaves the caret alone in the middle of a query", () => {
    const caret = { selectionEnd: 2, selectionStart: 2, value: "files" };
    expect(appMenuTabStep("ArrowLeft", caret)).toBeNull();
    expect(appMenuTabStep("ArrowRight", caret)).toBeNull();
  });

  it("steps from anywhere else in the dialog", () => {
    expect(appMenuTabStep("ArrowRight", null)).toBe(1);
    expect(appMenuTabStep("ArrowDown", null)).toBeNull();
  });
});
