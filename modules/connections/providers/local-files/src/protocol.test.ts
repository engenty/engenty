import { describe, expect, it } from "vitest";
import { assertSafeRelativePath, readInputSchema } from "./protocol.js";

describe("assertSafeRelativePath", () => {
  it("accepts nested forward-slash paths and returns segments", () => {
    expect(assertSafeRelativePath("a/b/c.txt")).toEqual(["a", "b", "c.txt"]);
    expect(assertSafeRelativePath("")).toEqual([]);
    expect(assertSafeRelativePath("/leading")).toEqual(["leading"]);
  });

  it("rejects traversal and backslashes", () => {
    expect(() => assertSafeRelativePath("../etc")).toThrow(/\.\./);
    expect(() => assertSafeRelativePath("a/../b")).toThrow(/\.\./);
    expect(() => assertSafeRelativePath("a/./b")).toThrow();
    expect(() => assertSafeRelativePath("a\\b")).toThrow(/forward slashes/);
  });
});

describe("read input schema", () => {
  it("caps max_bytes at MAX_FILE_BYTES", () => {
    expect(
      readInputSchema.safeParse({ max_bytes: 5_000_000, path: "a" }).success
    ).toBe(false);
    expect(
      readInputSchema.safeParse({ max_bytes: 100, path: "a" }).success
    ).toBe(true);
  });
});
