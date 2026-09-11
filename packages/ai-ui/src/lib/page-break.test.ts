import { describe, expect, it } from "vitest";
import {
  formatPageBreak,
  joinPagesWithBreaks,
  markdownFromPagedParseResult,
  splitMarkdownByPageBreaks,
} from "./page-break.js";

describe("formatPageBreak", () => {
  it("emits an explicitly closed sentinel", () => {
    expect(formatPageBreak({ number: 12, total: 240 })).toBe(
      '<page-break number="12" total="240"></page-break>'
    );
  });

  it("omits empty total and escapes printed", () => {
    expect(formatPageBreak({ number: 3, printed: '12"A' })).toBe(
      '<page-break number="3" printed="12&quot;A"></page-break>'
    );
  });
});

describe("joinPagesWithBreaks", () => {
  it("prefixes each page and skips blanks", () => {
    const markdown = joinPagesWithBreaks(
      [
        { markdown: "# Title", number: 1 },
        { markdown: "   ", number: 2 },
        { markdown: "Body", number: 3 },
      ],
      4
    );
    expect(markdown).toBe(
      [
        '<page-break number="1" total="4"></page-break>',
        "",
        "# Title",
        "",
        '<page-break number="3" total="4"></page-break>',
        "",
        "Body",
      ].join("\n")
    );
  });
});

describe("markdownFromPagedParseResult", () => {
  it("prefers per-page markdown over the concatenated fallback", () => {
    expect(
      markdownFromPagedParseResult({
        fallback: "ignored",
        pages: [
          { markdown: "A", number: 1 },
          { markdown: "B", number: 2 },
        ],
      })
    ).toContain('<page-break number="1" total="2"></page-break>');
  });

  it("falls back when pages have no text", () => {
    expect(
      markdownFromPagedParseResult({
        fallback: "whole doc",
        pages: [{ number: 1 }, { number: 2 }],
      })
    ).toBe("whole doc");
  });
});

describe("splitMarkdownByPageBreaks", () => {
  it("round-trips tagged markdown", () => {
    const source = joinPagesWithBreaks(
      [
        { markdown: "One", number: 1 },
        { markdown: "Two", number: 2 },
      ],
      2
    );
    expect(splitMarkdownByPageBreaks(source)).toEqual([
      { markdown: "One", number: 1, total: 2 },
      { markdown: "Two", number: 2, total: 2 },
    ]);
  });

  it("treats untagged text as a single page", () => {
    expect(splitMarkdownByPageBreaks("Just prose")).toEqual([
      { markdown: "Just prose", number: 1 },
    ]);
  });
});
