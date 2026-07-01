import { describe, expect, it } from "vitest";
import type { Article } from "../src/schema/types.js";
import { articleClipboardPlainAndHtml } from "../ui/lib/article-markdown-export.js";

function minimalArticle(partial: Partial<Article>): Article {
  return {
    id: "a1",
    kb_id: "kb1",
    tenant_id: "t1",
    scope_id: "s1",
    title: "T",
    slug: "t",
    status: "draft",
    parent_article_id: null,
    locked_at: null,
    content_json: null,
    content_markdown: "",
    created_at: "2020-01-01T00:00:00Z",
    updated_at: "2020-01-01T00:00:00Z",
    created_by: null,
    updated_by: null,
    deleted_at: null,
    published_at: null,
    sort_order: 0,
    questions_answered: [],
    summary: null,
    original_document_name: null,
    original_document_url: null,
    custom_properties: {},
    ...partial,
  };
}

describe("articleClipboardPlainAndHtml", () => {
  it("escapes title in html and keeps markdown in plain", () => {
    const article = minimalArticle({
      title: "Hi <em>",
      content_markdown: "**bold**",
    });
    const { plainText, htmlDocument } = articleClipboardPlainAndHtml(article);
    expect(plainText).toContain("# Hi <em>");
    expect(plainText).toContain("**bold**");
    expect(htmlDocument).toContain("Hi &lt;em&gt;");
    expect(htmlDocument).toContain("<strong>bold</strong>");
  });

  it("uses Untitled when title empty", () => {
    const article = minimalArticle({
      title: "   ",
      content_markdown: "x",
    });
    const { plainText } = articleClipboardPlainAndHtml(article);
    expect(plainText.startsWith("# Untitled\n\nx")).toBe(true);
  });
});
