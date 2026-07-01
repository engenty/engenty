import { describe, expect, it } from "vitest";
import { KB_CATEGORY_PAGE_SETTINGS_DEFAULTS } from "../src/schema/categories.js";
import type { Article, KbCategory } from "../src/schema/types.js";
import {
  compareArticlesForCategory,
  isCategoryArticleReorderable,
  resolveArticleCategoryId,
} from "../ui/lib/category-sidebar-sort.js";

function makeCategory(
  partial: Partial<KbCategory> & { id: string }
): KbCategory {
  return {
    cover: null,
    cover_inheritance: "none",
    created_at: "2026-01-01T00:00:00Z",
    description: null,
    id: partial.id,
    intro_json: null,
    intro_markdown: null,
    is_default: false,
    kb_id: "kb-1",
    name: partial.name ?? partial.id,
    outro_json: null,
    outro_markdown: null,
    page_settings: partial.page_settings ?? KB_CATEGORY_PAGE_SETTINGS_DEFAULTS,
    parent_id: null,
    scope_id: "scope",
    slug: partial.id,
    sort_order: 0,
    template_id: null,
    template_mode: "inherit",
    tenant_id: "tenant-1",
    updated_at: "2026-01-01T00:00:00Z",
    view_type: partial.view_type ?? "folder",
    ...partial,
  };
}

function makeArticle(partial: Partial<Article> & { id: string }): Article {
  return {
    category_id: "cat-1",
    content_json: null,
    content_markdown: null,
    created_at: "2026-01-01T00:00:00Z",
    created_by: null,
    custom_properties: {},
    deleted_at: null,
    id: partial.id,
    kb_id: "kb-1",
    locked_at: null,
    original_document_name: null,
    original_document_url: null,
    parent_article_id: null,
    published_at: null,
    questions_answered: [],
    scope_id: "scope",
    slug: partial.id,
    sort_order: partial.sort_order ?? 0,
    status: "draft",
    summary: null,
    tenant_id: "tenant-1",
    title: partial.title ?? partial.id,
    updated_at: "2026-01-01T00:00:00Z",
    updated_by: null,
    ...partial,
  };
}

describe("category sidebar sort", () => {
  it("allows reorder only for folder categories sorted manually", () => {
    const folderManual = makeCategory({
      id: "f1",
      view_type: "folder",
      page_settings: {
        ...KB_CATEGORY_PAGE_SETTINGS_DEFAULTS,
        collection: { sort_by: "sort_order", max_items: 50 },
      },
    });
    const folderAuto = makeCategory({
      id: "f2",
      view_type: "folder",
      page_settings: {
        ...KB_CATEGORY_PAGE_SETTINGS_DEFAULTS,
        collection: { sort_by: "name", max_items: 50 },
      },
    });
    const collection = makeCategory({
      id: "c1",
      view_type: "collection",
    });

    expect(isCategoryArticleReorderable(folderManual)).toBe(true);
    expect(isCategoryArticleReorderable(folderAuto)).toBe(false);
    expect(isCategoryArticleReorderable(collection)).toBe(false);
  });

  it("compareArticlesForCategory respects sort_order", () => {
    const category = makeCategory({ id: "cat-1", view_type: "folder" });
    const a = makeArticle({ id: "a", title: "B", sort_order: 2 });
    const b = makeArticle({ id: "b", title: "A", sort_order: 1 });
    expect(compareArticlesForCategory(a, b, category)).toBeGreaterThan(0);
  });

  it("resolveArticleCategoryId falls back to default when category is unknown", () => {
    const defaultCat = makeCategory({ id: "default" });
    const categories = new Map([[defaultCat.id, defaultCat]]);
    const article = makeArticle({
      id: "a",
      category_id: "missing",
    });
    expect(resolveArticleCategoryId(article, categories, "default")).toBe(
      "default"
    );
  });
});
