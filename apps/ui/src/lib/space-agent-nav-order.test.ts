import { describe, expect, it } from "vitest";
import { arrayMoveIds } from "./space-agent-nav-order";

describe("arrayMoveIds", () => {
  it("moves an id within the list", () => {
    expect(arrayMoveIds(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
    expect(arrayMoveIds(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
  });

  it("is a no-op when either id is missing", () => {
    expect(arrayMoveIds(["a", "b"], "a", "z")).toEqual(["a", "b"]);
    expect(arrayMoveIds(["a", "b"], "z", "a")).toEqual(["a", "b"]);
  });
});
