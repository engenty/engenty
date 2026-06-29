import { describe, expect, it } from "vitest";
import { htmlToMarkdown } from "./html-to-markdown.js";

describe("htmlToMarkdown (Turndown + GFM)", () => {
  it("converts headings and emphasis", () => {
    const md = htmlToMarkdown(
      "<h1>Title</h1><p>Hello <strong>world</strong> and <em>you</em></p>"
    );
    expect(md).toContain("# Title");
    expect(md).toContain("**world**");
    expect(md).toContain("*you*");
  });

  it("supports GFM tables", () => {
    const html =
      "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("|");
    expect(md).toContain("A");
    expect(md).toContain("B");
  });

  it("converts links", () => {
    expect(htmlToMarkdown('<a href="https://ex.com">x</a>')).toBe(
      "[x](https://ex.com)"
    );
  });
});
