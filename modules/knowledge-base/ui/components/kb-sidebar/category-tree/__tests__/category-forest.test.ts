/**
 * Tests for the combined category + article forest builder used by the
 * sidebar folder mode. Covers default seeding, nesting, fallback to the
 * default category for orphan articles, and search filtering.
 */

import { describe, expect, it } from "vitest";
import { KB_CATEGORY_PAGE_SETTINGS_DEFAULTS } from "../../../../../src/schema/categories.js";
import type { Article, KbCategory } from "../../../../../src/schema/types.js";
import {
  buildCategoryArticleForest,
  filterCategoryForest,
} from "../category-forest.js";

function makeCategory(
  partial: Partial<KbCategory> & { id: string }
): KbCategory {
  return {
    comments_mode: "inherit",
    created_at: "2026-01-01T00:00:00Z",
    description: null,
    icon: null,
    is_default: partial.is_default ?? false,
    kb_id: "kb-1",
    name: partial.name ?? partial.id,
    parent_id: partial.parent_id ?? null,
    scope_id: "scope",
    slug: partial.slug ?? partial.id,
    sort_order: partial.sort_order ?? 0,
    tenant_id: "tenant-1",
    updated_at: "2026-01-01T00:00:00Z",
    view_type: partial.view_type ?? "folder",
    page_settings: partial.page_settings ?? KB_CATEGORY_PAGE_SETTINGS_DEFAULTS,
    cover: null,
    cover_inheritance: "none",
    intro_json: null,
    intro_markdown: null,
    outro_json: null,
    outro_markdown: null,
    template_id: null,
    template_mode: "inherit",
    ...partial,
  };
}

function makeArticle(partial: Partial<Article> & { id: string }): Article {
  return {
    category_id: partial.category_id ?? "cat-default",
    comments_mode: "inherit",
    content_json: null,
    content_markdown: null,
    created_at: "2026-01-01T00:00:00Z",
    created_by: null,
    custom_properties: {},
    deleted_at: null,
    kb_id: "kb-1",
    locked_at: null,
    original_document_name: null,
    original_document_url: null,
    parent_article_id: partial.parent_article_id ?? null,
    published_at: null,
    questions_answered: [],
    scope_id: "scope",
    slug: partial.slug ?? partial.id,
    sort_order: partial.sort_order ?? 0,
    status: "draft",
    summary: null,
    template_id: null,
    template_mode: "inherit",
    tenant_id: "tenant-1",
    title: partial.title ?? partial.id,
    updated_at: "2026-01-01T00:00:00Z",
    updated_by: null,
    ...partial,
  };
}

describe("buildCategoryArticleForest", () => {
  it("places articles under their category and the default first", () => {
    const categories: KbCategory[] = [
      makeCategory({
        id: "cat-default",
        name: "General",
        is_default: true,
      }),
      makeCategory({ id: "cat-guides", name: "Guides", sort_order: 1 }),
    ];
    const articles: Article[] = [
      makeArticle({
        id: "a-1",
        title: "Welcome",
        category_id: "cat-default",
      }),
      makeArticle({
        id: "a-2",
        title: "Quickstart",
        category_id: "cat-guides",
      }),
    ];

    const forest = buildCategoryArticleForest({
      articles,
      categories,
      defaultCategoryId: "cat-default",
    });

    expect(forest.map((n) => n.category.id)).toEqual([
      "cat-default",
      "cat-guides",
    ]);
    expect(forest[0].articles.map((a) => a.article.id)).toEqual(["a-1"]);
    expect(forest[1].articles.map((a) => a.article.id)).toEqual(["a-2"]);
  });

  it("nests sub-categories under their parent", () => {
    const categories: KbCategory[] = [
      makeCategory({
        id: "cat-default",
        name: "General",
        is_default: true,
      }),
      makeCategory({ id: "cat-product", name: "Product" }),
      makeCategory({
        id: "cat-onboarding",
        name: "Onboarding",
        parent_id: "cat-product",
      }),
    ];
    const articles: Article[] = [
      makeArticle({
        id: "a-1",
        title: "Day 1",
        category_id: "cat-onboarding",
      }),
    ];

    const forest = buildCategoryArticleForest({
      articles,
      categories,
      defaultCategoryId: "cat-default",
    });
    const product = forest.find((n) => n.category.id === "cat-product");
    expect(product).toBeDefined();
    expect(product?.children.map((c) => c.category.id)).toEqual([
      "cat-onboarding",
    ]);
    expect(product?.children[0].articles.map((a) => a.article.id)).toEqual([
      "a-1",
    ]);
  });

  it("falls back to default category when category_id is unknown", () => {
    const categories: KbCategory[] = [
      makeCategory({
        id: "cat-default",
        name: "General",
        is_default: true,
      }),
    ];
    const articles: Article[] = [
      makeArticle({
        id: "a-orphan",
        title: "Orphan",
        category_id: "cat-removed",
      }),
    ];

    const forest = buildCategoryArticleForest({
      articles,
      categories,
      defaultCategoryId: "cat-default",
    });

    expect(forest).toHaveLength(1);
    expect(forest[0].articles.map((a) => a.article.id)).toEqual(["a-orphan"]);
  });
});

describe("filterCategoryForest", () => {
  const categories: KbCategory[] = [
    makeCategory({ id: "cat-default", name: "General", is_default: true }),
    makeCategory({ id: "cat-guides", name: "Guides", sort_order: 1 }),
  ];
  const articles: Article[] = [
    makeArticle({
      id: "a-1",
      title: "Welcome",
      category_id: "cat-default",
    }),
    makeArticle({
      id: "a-2",
      title: "Tutorial: Quickstart",
      category_id: "cat-guides",
    }),
  ];
  const forest = buildCategoryArticleForest({
    articles,
    categories,
    defaultCategoryId: "cat-default",
  });

  it("returns full forest when query is empty", () => {
    expect(filterCategoryForest(forest, "")).toEqual(forest);
  });

  it("keeps categories whose name matches", () => {
    const filtered = filterCategoryForest(forest, "guides");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].category.id).toBe("cat-guides");
    // category match keeps all its articles
    expect(filtered[0].articles).toHaveLength(1);
  });

  it("keeps categories whose articles match", () => {
    const filtered = filterCategoryForest(forest, "tutorial");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].category.id).toBe("cat-guides");
    expect(filtered[0].articles[0].article.id).toBe("a-2");
  });
});
