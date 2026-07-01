import { describe, expect, it, vi } from "vitest";
import type { Article } from "../schema/types.js";
import { refreshKbArticleMetadata } from "./kb-article-metadata-refresh.js";

function articleStub(): Article {
  return {
    id: "a1",
    kb_id: "kb1",
    category_id: "cat1",
    comments_mode: "inherit",
    content_json: null,
    content_markdown: "Body",
    created_at: "",
    created_by: null,
    custom_properties: {},
    deleted_at: null,
    locked_at: "2026-01-01T00:00:00.000Z",
    original_document_name: null,
    original_document_url: null,
    parent_article_id: null,
    published_at: null,
    questions_answered: [],
    scope_id: "scope",
    slug: "page",
    sort_order: 0,
    status: "published",
    summary: null,
    template_id: null,
    template_mode: "inherit",
    tenant_id: "tenant",
    title: "Page",
    updated_at: "",
    updated_by: null,
  };
}

describe("refreshKbArticleMetadata", () => {
  it("rejects locked articles before metadata extraction", async () => {
    await expect(
      refreshKbArticleMetadata(
        {
          articles: { update: vi.fn() },
          categories: { list: vi.fn() },
          templates: { getById: vi.fn() },
        },
        articleStub()
      )
    ).rejects.toThrow("Article is locked");
  });
});
