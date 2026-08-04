import { describe, expect, it } from "vitest";
import { coerceJsonValue } from "./ag-ui-inspector-json-tree.js";

describe("coerceJsonValue", () => {
  it("parses JSON object strings", () => {
    expect(coerceJsonValue('{"a":1}')).toEqual({ a: 1 });
  });

  it("parses JSON array strings", () => {
    expect(coerceJsonValue("[1,2]")).toEqual([1, 2]);
  });

  it("leaves plain strings unchanged", () => {
    expect(coerceJsonValue("hello")).toBe("hello");
  });

  it("passes through objects", () => {
    expect(coerceJsonValue({ a: true })).toEqual({ a: true });
  });
});
