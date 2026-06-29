import { describe, expect, it } from "vitest";
import {
  extractHeadSummaryMarkdown,
  htmlToMarkdownFromFetchedPage,
  isLikelyClientRenderedShell,
  stripHtmlForMarkdown,
} from "./html-prepare.js";

describe("stripHtmlForMarkdown", () => {
  it("removes script, style, noscript, and template bodies", () => {
    const html = `<html><body>
      <p>Keep</p>
      <script>evil(); (self.__next_f=[]).push([0])</script>
      <style>.x{}</style>
      <noscript>no</noscript>
      <template>tpl</template>
    </body></html>`;
    const out = stripHtmlForMarkdown(html);
    expect(out).not.toContain("__next_f");
    expect(out).not.toContain("evil");
    expect(out).not.toContain(".x{}");
    expect(out).not.toContain("tpl");
    expect(out).toContain("Keep");
  });
});

describe("isLikelyClientRenderedShell", () => {
  it("detects Next bailout marker", () => {
    expect(
      isLikelyClientRenderedShell(
        '<template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING"></template>'
      )
    ).toBe(true);
  });
  it("detects Flight payload marker", () => {
    expect(isLikelyClientRenderedShell("self.__next_f.push")).toBe(true);
  });
  it("is false for static article HTML", () => {
    expect(
      isLikelyClientRenderedShell(
        "<html><body><article><h1>Hi</h1><p>Text</p></article></body></html>"
      )
    ).toBe(false);
  });
});

describe("extractHeadSummaryMarkdown", () => {
  it("builds markdown from title and meta description", () => {
    const html = `<head>
      <title>Doc Title</title>
      <meta name="description" content="One line summary."/>
    </head>`;
    expect(extractHeadSummaryMarkdown(html)).toBe(
      "# Doc Title\n\nOne line summary."
    );
  });
  it("falls back to og:description", () => {
    const html = `<head>
      <title>T</title>
      <meta property="og:description" content="OG desc"/>
    </head>`;
    expect(extractHeadSummaryMarkdown(html)).toContain("OG desc");
  });
});

describe("htmlToMarkdownFromFetchedPage", () => {
  it("returns title + hint for Next-style shell instead of script dump", () => {
    const html = `<!DOCTYPE html><html><head>
      <title>Open Generative UI</title>
      <meta name="description" content="Let agents generate UI."/>
    </head><body>
      <template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING"></template>
      <script>(self.__next_f=self.__next_f||[]).push([0]); huge junk</script>
    </body></html>`;
    const md = htmlToMarkdownFromFetchedPage(html);
    expect(md).toContain("# Open Generative UI");
    expect(md).toContain("Let agents generate UI");
    expect(md).toContain("FIRECRAWL_API_KEY");
    expect(md).not.toContain("__next_f");
    expect(md).not.toContain("huge junk");
  });

  it("returns turndown body for normal pages", () => {
    const html = `<html><body><h1>Title</h1><p>${"x".repeat(200)}</p></body></html>`;
    const md = htmlToMarkdownFromFetchedPage(html);
    expect(md).toContain("# Title");
    expect(md).toContain("xxx");
    expect(md).not.toContain("FIRECRAWL_API_KEY");
  });
});
