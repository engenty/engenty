import { describe, expect, it } from "vitest";
import {
  buildSubPageIndexMarkdown,
  resolveIngestContentFlags,
  SUB_PAGE_SPLIT_THRESHOLD_CHARS,
  splitMarkdownIntoSubPages,
} from "./ingest-article-plan.js";

describe("resolveIngestContentFlags", () => {
  it("defaults to the full text when nothing is chosen", () => {
    const flags = resolveIngestContentFlags({}, false);
    expect(flags.includeFullContent).toBe(true);
    expect(flags.includeSummary).toBe(false);
  });

  it("drops the full-text default once a summary is asked for", () => {
    const flags = resolveIngestContentFlags({ include_summary: true }, false);
    expect(flags.includeFullContent).toBe(false);
    expect(flags.includeSummary).toBe(true);
  });

  it("keeps both when both are asked for", () => {
    const flags = resolveIngestContentFlags(
      { include_full_content: true, include_summary: true },
      false
    );
    expect(flags.includeFullContent).toBe(true);
    expect(flags.includeSummary).toBe(true);
  });

  it("falls back to the full text rather than creating an empty article", () => {
    const flags = resolveIngestContentFlags(
      { include_full_content: false, include_summary: false },
      false
    );
    expect(flags.includeFullContent).toBe(true);
  });

  it("respects an empty body when a template structure will fill it", () => {
    const flags = resolveIngestContentFlags(
      { include_full_content: false, include_summary: false },
      true
    );
    expect(flags.includeFullContent).toBe(false);
  });

  it("cannot split what has no full text", () => {
    const flags = resolveIngestContentFlags(
      { include_summary: true, split_long_articles: true },
      false
    );
    expect(flags.splitLongArticles).toBe(false);
  });
});

function longDoc(headings: string[], level = "##"): string {
  const filler = "x".repeat(
    Math.ceil(SUB_PAGE_SPLIT_THRESHOLD_CHARS / headings.length) + 100
  );
  return headings
    .map((heading) => `${level} ${heading}\n\n${filler}`)
    .join("\n\n");
}

describe("splitMarkdownIntoSubPages", () => {
  it("leaves short documents alone", () => {
    expect(splitMarkdownIntoSubPages("## A\n\nshort\n\n## B\n\nshort")).toBe(
      null
    );
  });

  it("splits a long document at its headings", () => {
    const split = splitMarkdownIntoSubPages(
      longDoc(["Alpha", "Beta", "Gamma"])
    );
    expect(split?.pages.map((page) => page.title)).toEqual([
      "Alpha",
      "Beta",
      "Gamma",
    ]);
    expect(split?.pages[0]?.markdown.startsWith("## Alpha")).toBe(false);
  });

  it("keeps the text above the first heading as the index lead-in", () => {
    const split = splitMarkdownIntoSubPages(
      `Preamble line\n\n${longDoc(["Alpha", "Beta"])}`
    );
    expect(split?.intro).toBe("Preamble line");
  });

  it("descends past a lone title to the level that actually splits", () => {
    const split = splitMarkdownIntoSubPages(
      `# The document\n\n${longDoc(["Alpha", "Beta"])}`
    );
    expect(split?.pages.map((page) => page.title)).toEqual(["Alpha", "Beta"]);
  });

  it("ignores headings inside code fences", () => {
    const fenced = `\`\`\`\n# not a heading\n\`\`\`\n\n${"y".repeat(SUB_PAGE_SPLIT_THRESHOLD_CHARS)}`;
    expect(splitMarkdownIntoSubPages(fenced)).toBe(null);
  });

  it("returns null when a long document has no headings to split on", () => {
    expect(
      splitMarkdownIntoSubPages("z".repeat(SUB_PAGE_SPLIT_THRESHOLD_CHARS + 1))
    ).toBe(null);
  });
});

describe("buildSubPageIndexMarkdown", () => {
  it("lists the sub-pages under the intro", () => {
    const markdown = buildSubPageIndexMarkdown(
      "Lead-in.",
      [{ title: "Alpha" }, { title: "Beta" }],
      "Contents"
    );
    expect(markdown).toBe("Lead-in.\n\n## Contents\n\n1. Alpha\n2. Beta");
  });

  it("omits an empty intro instead of leaving a blank line", () => {
    const markdown = buildSubPageIndexMarkdown(
      "",
      [{ title: "Alpha" }],
      "Contents"
    );
    expect(markdown).toBe("## Contents\n\n1. Alpha");
  });

  it("links entries whose sub-page already exists", () => {
    const markdown = buildSubPageIndexMarkdown(
      "",
      [{ articleId: "art-9", title: "Alpha" }, { title: "Beta" }],
      "Contents",
      (id) => `/kb/${id}`
    );
    // Beta has no id yet, so it stays plain rather than linking nowhere.
    expect(markdown).toBe("## Contents\n\n1. [Alpha](/kb/art-9)\n2. Beta");
  });
});
