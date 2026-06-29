import { describe, expect, it, vi } from "vitest";
import {
  cleanPageTitle,
  extractFirstMarkdownH1,
  isTitleUrlLike,
  resolvePageTitleHeuristic,
  resolveSuggestedPageTitle,
  titleFromUrlPath,
} from "./resolve-page-title.js";

describe("isTitleUrlLike", () => {
  it("detects full URLs", () => {
    expect(isTitleUrlLike("https://example.com/docs/page")).toBe(true);
    expect(
      isTitleUrlLike(
        "https://example.com/docs/page",
        "https://example.com/docs/page"
      )
    ).toBe(true);
  });

  it("accepts normal titles", () => {
    expect(isTitleUrlLike("Getting started")).toBe(false);
    expect(isTitleUrlLike("API Reference - Docs")).toBe(false);
  });
});

describe("cleanPageTitle", () => {
  it("strips site suffixes", () => {
    expect(cleanPageTitle("Hello World | Example Site")).toBe("Hello World");
    expect(cleanPageTitle("Guide - Acme Docs")).toBe("Guide");
  });
});

describe("extractFirstMarkdownH1", () => {
  it("returns first ATX h1 outside fences", () => {
    const md = "```\n# not this\n```\n\n# Real Title\n\nBody";
    expect(extractFirstMarkdownH1(md)).toBe("Real Title");
  });
});

describe("resolvePageTitleHeuristic", () => {
  it("prefers og:title over url-like document title", () => {
    const html = `<head>
      <title>https://example.com/page</title>
      <meta property="og:title" content="Product overview"/>
    </head>`;
    expect(
      resolvePageTitleHeuristic({
        html,
        markdown: "# Body",
        pageUrl: "https://example.com/page",
      })
    ).toBe("Product overview");
  });

  it("uses markdown h1 when head titles are url-like", () => {
    const html = "<head><title>https://example.com/x</title></head>";
    expect(
      resolvePageTitleHeuristic({
        html,
        markdown: "# Human readable\n\nText",
        pageUrl: "https://example.com/x",
      })
    ).toBe("Human readable");
  });
});

describe("titleFromUrlPath", () => {
  it("humanizes last path segment", () => {
    expect(titleFromUrlPath("https://example.com/docs/getting-started")).toBe(
      "getting started"
    );
  });
});

describe("resolveSuggestedPageTitle", () => {
  it("returns heuristic without LLM when head title is usable", async () => {
    const html = "<head><title>Nice Page - Site</title></head>";
    const title = await resolveSuggestedPageTitle({
      html,
      markdown: "Body",
      pageUrl: "https://example.com/nice",
      skipTitleLlm: true,
    });
    expect(title).toBe("Nice Page");
  });

  it("falls back to path segment when heuristics fail", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    const title = await resolveSuggestedPageTitle({
      html: "<head><title>https://example.com/foo/bar-baz</title></head>",
      markdown: "No heading here.",
      pageUrl: "https://example.com/foo/bar-baz",
      skipTitleLlm: true,
    });
    expect(title).toBe("bar baz");
  });
});
