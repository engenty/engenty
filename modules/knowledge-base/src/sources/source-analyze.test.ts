import { describe, expect, it } from "vitest";
import {
  buildAnalysisExcerpts,
  evenlySpacedSample,
  excerptCharsPerItem,
} from "./source-analyze.js";

describe("evenlySpacedSample", () => {
  it("returns everything when the sample is not smaller", () => {
    expect(evenlySpacedSample([1, 2, 3], 5)).toEqual([1, 2, 3]);
  });

  it("spans the whole range instead of taking a prefix", () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const picked = evenlySpacedSample(items, 5);
    // A prefix would be [0,1,2,3,4] and would only ever show front matter.
    expect(picked).toEqual([0, 25, 50, 74, 99]);
  });

  it("always includes the first and last item", () => {
    const items = Array.from({ length: 37 }, (_, i) => i);
    const picked = evenlySpacedSample(items, 4);
    expect(picked[0]).toBe(0);
    expect(picked.at(-1)).toBe(36);
  });

  it("handles degenerate counts", () => {
    expect(evenlySpacedSample([1, 2, 3], 1)).toEqual([1]);
    expect(evenlySpacedSample([], 3)).toEqual([]);
  });
});

describe("excerptCharsPerItem", () => {
  it("gives a single huge item the whole budget", () => {
    // The case that used to break: one 800kB law sampled at a flat 3k saw only
    // its page header, so the analyzer could only echo the table of contents.
    expect(excerptCharsPerItem(1)).toBe(40_000);
  });

  it("splits the budget across a wider sample", () => {
    expect(excerptCharsPerItem(10)).toBe(4000);
  });

  it("never starves an item below the floor", () => {
    expect(excerptCharsPerItem(100)).toBe(2000);
  });
});

describe("buildAnalysisExcerpts", () => {
  it("keeps a single item that fills the entire budget", () => {
    // The regression: one long document, sampled alone, gets the whole budget
    // as its per-item allowance — so the block overflows by its own header and
    // used to be dropped, leaving the analyzer with nothing to read.
    const excerpts = buildAnalysisExcerpts(
      [{ text: "x".repeat(50_000), title: "Nordsee", url: "https://x.test" }],
      40_000,
      40_000
    );
    expect(excerpts).toHaveLength(1);
    expect(excerpts[0]?.length).toBeLessThanOrEqual(40_000);
    expect(excerpts[0]).toContain("### Nordsee");
  });

  it("charges the budget across several items and stops when it is spent", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      text: "y".repeat(500),
      title: `Item ${i}`,
    }));
    const excerpts = buildAnalysisExcerpts(items, 500, 1200);
    expect(excerpts.length).toBeGreaterThan(0);
    expect(excerpts.length).toBeLessThan(10);
    expect(excerpts.join("").length).toBeLessThanOrEqual(1200);
  });

  it("says so when an item has no fetched text, rather than emitting a bare header", () => {
    const excerpts = buildAnalysisExcerpts(
      [{ text: "   ", title: "Empty" }],
      100
    );
    expect(excerpts[0]).toContain("(no fetched content)");
  });

  it("omits the URL line for an item that has none", () => {
    const excerpts = buildAnalysisExcerpts(
      [{ text: "hello", title: "T" }],
      100
    );
    expect(excerpts[0]).toBe("### T\nhello");
  });
});
