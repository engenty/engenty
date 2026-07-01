import { describe, expect, it } from "vitest";
import type { Article } from "../src/schema/types.js";
import { buildArticlePdfHtml } from "../src/services/article-pdf-html.js";

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
    content_markdown: "# Hi",
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

describe("buildArticlePdfHtml", () => {
  it("escapes title and embeds markdown body", () => {
    const html = buildArticlePdfHtml(
      minimalArticle({ title: "A <B> C", content_markdown: "## x\n" }),
      null
    );
    expect(html).toContain("A &lt;B&gt; C");
    expect(html).toContain("<h2");
  });
});
