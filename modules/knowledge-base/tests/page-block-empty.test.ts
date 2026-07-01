import { describe, expect, it } from "vitest";
import type {
  KbPageArticlesBlock,
  KbPageCategoriesBlock,
  KbPageContentBlock,
  KbPageFaqsBlock,
} from "../src/schema/page-blocks.js";
import type { Article, Faq, KbCategory } from "../src/schema/types.js";
import {
  isKbPageArticlesBlockEmpty,
  isKbPageCategoriesBlockEmpty,
  isKbPageContentBlockEmpty,
  isKbPageFaqsBlockEmpty,
  jsonIsEmptyDoc,
} from "../ui/lib/page-blocks/page-block-empty.js";

const baseContentBlock: KbPageContentBlock = {
  id: "c1",
  type: "content",
  visible: true,
  content_json: null,
  content_markdown: null,
};

const baseCategoriesBlock: KbPageCategoriesBlock = {
  id: "cat1",
  type: "categories",
  visible: true,
  headline: null,
  style: "cards",
  scope: "direct_children",
  manual_category_ids: [],
  sort: "sort_order",
  category_count_display: "direct",
  show_icon: true,
  show_description: true,
  show_articles: false,
  articles_sort_by: "sort_order",
  articles_max_items: 6,
  articles_include_drafts: false,
};

const baseArticlesBlock: KbPageArticlesBlock = {
  id: "a1",
  type: "articles",
  visible: true,
  headline: null,
  style: "list",
  grouped_by_category: false,
  show_icon: false,
  show_description: true,
  source: "direct_sorted",
  sort_by: "sort_order",
  max_items: 10,
  include_drafts: false,
  manual_article_ids: [],
  property_filters: {},
};

const baseFaqsBlock: KbPageFaqsBlock = {
  id: "f1",
  type: "faqs",
  visible: true,
  headline: null,
  max_items: 5,
  include_drafts: false,
  show_view_all_link: true,
};

const faqs: Faq[] = [
  {
    id: "faq1",
    kb_id: "kb1",
    question: "How?",
    answer_json: null,
    answer_markdown: null,
    sort_order: 0,
    status: "published",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    created_by: null,
    deleted_at: null,
    scope_id: "scope1",
    tenant_id: "tenant1",
  },
];

const categories: KbCategory[] = [
  {
    id: "root",
    kb_id: "kb1",
    name: "Root",
    slug: "root",
    parent_id: null,
    sort_order: 0,
    icon: null,
    description: null,
    is_default: false,
    view_type: "folder",
    cover_url: null,
    page_settings: { blocks: [], collection: { sort_by: "sort_order" } },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "child",
    kb_id: "kb1",
    name: "Child",
    slug: "child",
    parent_id: "root",
    sort_order: 0,
    icon: null,
    description: null,
    is_default: false,
    view_type: "folder",
    cover_url: null,
    page_settings: { blocks: [], collection: { sort_by: "sort_order" } },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

const articles: Article[] = [
  {
    id: "art1",
    kb_id: "kb1",
    category_id: "child",
    title: "Article",
    slug: "article",
    status: "published",
    sort_order: 0,
    summary: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } as Article,
];

describe("page block empty checks", () => {
  it("jsonIsEmptyDoc treats null and blank docs as empty", () => {
    expect(jsonIsEmptyDoc(null)).toBe(true);
    expect(jsonIsEmptyDoc({ type: "doc", content: [] })).toBe(true);
    expect(
      jsonIsEmptyDoc({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: " " }] },
        ],
      })
    ).toBe(true);
  });

  it("jsonIsEmptyDoc detects meaningful content", () => {
    expect(
      jsonIsEmptyDoc({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Hello" }],
          },
        ],
      })
    ).toBe(false);
  });

  it("isKbPageContentBlockEmpty uses markdown fallback", () => {
    expect(isKbPageContentBlockEmpty(baseContentBlock)).toBe(true);
    expect(
      isKbPageContentBlockEmpty({
        ...baseContentBlock,
        content_markdown: "Intro text",
      })
    ).toBe(false);
  });

  it("isKbPageCategoriesBlockEmpty respects scope", () => {
    expect(
      isKbPageCategoriesBlockEmpty(baseCategoriesBlock, categories, null)
    ).toBe(false);
    expect(
      isKbPageCategoriesBlockEmpty(baseCategoriesBlock, categories, "root")
    ).toBe(false);
    expect(
      isKbPageCategoriesBlockEmpty(baseCategoriesBlock, categories, "child")
    ).toBe(true);
    expect(
      isKbPageCategoriesBlockEmpty(
        { ...baseCategoriesBlock, scope: "manual", manual_category_ids: [] },
        categories,
        null
      )
    ).toBe(true);
  });

  it("isKbPageArticlesBlockEmpty respects resolved articles", () => {
    expect(
      isKbPageArticlesBlockEmpty(baseArticlesBlock, articles, categories)
    ).toBe(false);
    expect(
      isKbPageArticlesBlockEmpty(
        baseArticlesBlock,
        articles,
        categories,
        "root"
      )
    ).toBe(true);
    expect(
      isKbPageArticlesBlockEmpty(
        baseArticlesBlock,
        articles,
        categories,
        "child"
      )
    ).toBe(false);
    expect(
      isKbPageArticlesBlockEmpty(
        {
          ...baseArticlesBlock,
          source: "manual_pick",
          manual_article_ids: ["art1"],
        },
        articles,
        categories
      )
    ).toBe(false);
    expect(isKbPageArticlesBlockEmpty(baseArticlesBlock, [], categories)).toBe(
      true
    );
  });

  it("isKbPageFaqsBlockEmpty respects published-only filter", () => {
    expect(isKbPageFaqsBlockEmpty(baseFaqsBlock, [])).toBe(true);
    expect(isKbPageFaqsBlockEmpty(baseFaqsBlock, faqs)).toBe(false);
    expect(
      isKbPageFaqsBlockEmpty(baseFaqsBlock, [{ ...faqs[0]!, status: "draft" }])
    ).toBe(true);
    expect(
      isKbPageFaqsBlockEmpty({ ...baseFaqsBlock, include_drafts: true }, [
        { ...faqs[0]!, status: "draft" },
      ])
    ).toBe(false);
  });
});
