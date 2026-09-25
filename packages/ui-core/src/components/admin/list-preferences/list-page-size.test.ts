import { describe, expect, it } from "vitest";
import { normalizeListPageSize } from "./list-page-size.js";

describe("list page size", () => {
  it("normalizes valid preset values", () => {
    expect(normalizeListPageSize(100)).toBe(100);
    expect(normalizeListPageSize("250")).toBe(250);
    expect(normalizeListPageSize(1000)).toBe(1000);
  });

  it("falls back to default for invalid values", () => {
    expect(normalizeListPageSize(30)).toBe(25);
    expect(normalizeListPageSize(2000)).toBe(25);
    expect(normalizeListPageSize(null)).toBe(25);
    expect(normalizeListPageSize("")).toBe(25);
  });
});
