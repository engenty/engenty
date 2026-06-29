import { describe, expect, it } from "vitest";
import {
  LIST_PAGE_SIZE_DEFAULT,
  LIST_PAGE_SIZE_MAX,
  LIST_PAGE_SIZE_OPTIONS,
  normalizeListPageSize,
} from "./list-page-size.js";

describe("list page size", () => {
  it("exposes preset options capped at 1000", () => {
    expect(LIST_PAGE_SIZE_OPTIONS).toEqual([25, 50, 100, 250, 500, 1000]);
    expect(LIST_PAGE_SIZE_MAX).toBe(1000);
    expect(LIST_PAGE_SIZE_DEFAULT).toBe(25);
  });

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
