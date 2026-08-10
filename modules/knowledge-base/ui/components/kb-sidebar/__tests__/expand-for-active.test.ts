import { describe, expect, it } from "vitest";
import type { Article } from "../../../../src/schema/types.js";
import { collectArticleBranchIdsToReveal } from "../lib/expand-for-active.js";

function art(id: string, parent_article_id: string | null): Article {
  return {
    id,
    kb_id: "kb1",
    title: id,
    slug: id,
    parent_article_id,
    category_id: "cat1",
    comments_mode: "inherit",
    template_id: null,
    template_mode: "inherit",
    sort_order: 0,
    status: "draft",
    content_json: null,
    content_markdown: null,
    created_at: "",
    created_by: null,
    custom_properties: {},
    deleted_at: null,
    locked_at: null,
    original_document_name: null,
    original_document_url: null,
    published_at: null,
    questions_answered: [],
    scope_id: "s1",
    summary: null,
    tenant_id: "t1",
    updated_at: "",
    updated_by: null,
  };
}

describe("collectArticleBranchIdsToReveal", () => {
  it("returns empty when article missing", () => {
    expect(collectArticleBranchIdsToReveal("x", [])).toEqual([]);
  });

  it("collects ancestors for nested page", () => {
    const articles = [art("p", null), art("c", "p"), art("g", "c")];
    expect(collectArticleBranchIdsToReveal("g", articles)).toEqual(["c", "p"]);
  });
});
