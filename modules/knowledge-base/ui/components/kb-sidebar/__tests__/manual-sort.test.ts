import { describe, expect, it } from "vitest";
import type { Article } from "../../../../src/schema/types.js";
import {
  compareManualSiblings,
  getManualSortSiblings,
} from "../lib/manual-sort.js";

function art(
  partial: Pick<Article, "id" | "title" | "sort_order"> &
    Partial<Pick<Article, "parent_article_id" | "category_id">>
): Article {
  return {
    id: partial.id,
    title: partial.title,
    sort_order: partial.sort_order,
    parent_article_id: partial.parent_article_id ?? null,
    category_id: partial.category_id ?? "cat-default",
    slug: partial.id,
    status: "draft",
    summary: null,
    content_json: null,
    content_markdown: "",
    created_at: new Date().toISOString(),
    created_by: null,
    deleted_at: null,
    locked_at: null,
    original_document_name: null,
    original_document_url: null,
    published_at: null,
    questions_answered: [],
    scope_id: "s1",
    tenant_id: "t1",
    updated_at: new Date().toISOString(),
    updated_by: null,
    custom_properties: {},
    comments_mode: "inherit",
    kb_id: "kb1",
    template_id: null,
    template_mode: "inherit",
  };
}

describe("getManualSortSiblings", () => {
  it("groups siblings by effective parent in bucket scope", () => {
    const a = art({
      id: "a",
      title: "A",
      sort_order: 0,
      parent_article_id: null,
    });
    const b = art({
      id: "b",
      title: "B",
      sort_order: 1,
      parent_article_id: null,
    });
    const child = art({
      id: "child",
      title: "Child",
      sort_order: 0,
      parent_article_id: "a",
    });
    const otherRoot = art({
      id: "x",
      title: "X",
      sort_order: 0,
      parent_article_id: null,
    });
    const all = [a, b, child, otherRoot];
    expect(getManualSortSiblings(a, all, "asc").map((x) => x.id)).toEqual([
      "a",
      "x",
      "b",
    ]);
    expect(getManualSortSiblings(child, all, "asc").map((x) => x.id)).toEqual([
      "child",
    ]);
  });

  it("scope flat returns all articles sorted by manual order", () => {
    const a = art({
      id: "a",
      title: "A",
      sort_order: 2,
      parent_article_id: null,
    });
    const b = art({
      id: "b",
      title: "B",
      sort_order: 0,
      parent_article_id: null,
    });
    const all = [a, b];
    expect(
      getManualSortSiblings(a, all, "asc", "flat").map((x) => x.id)
    ).toEqual(["b", "a"]);
    expect(
      getManualSortSiblings(b, all, "asc", "flat").map((x) => x.id)
    ).toEqual(["b", "a"]);
  });

  it("treats parent not in set as root bucket", () => {
    const orphan = art({
      id: "o",
      title: "O",
      sort_order: 0,
      parent_article_id: "missing",
    });
    const root = art({
      id: "r",
      title: "R",
      sort_order: 1,
      parent_article_id: null,
    });
    const all = [orphan, root];
    expect(getManualSortSiblings(orphan, all, "asc").map((x) => x.id)).toEqual([
      "o",
      "r",
    ]);
  });

  it("scopes siblings to the same category bucket in folder view", () => {
    const catA = "cat-a";
    const catB = "cat-b";
    const categoryIds = new Set([catA, catB]);
    const a = art({
      id: "a",
      title: "A",
      sort_order: 0,
      parent_article_id: null,
      category_id: catA,
    });
    const b = art({
      id: "b",
      title: "B",
      sort_order: 1,
      parent_article_id: null,
      category_id: catA,
    });
    const otherCat = art({
      id: "x",
      title: "X",
      sort_order: 0,
      parent_article_id: null,
      category_id: catB,
    });
    const all = [a, b, otherCat];
    expect(
      getManualSortSiblings(a, all, "asc", {
        scope: "bucket",
        categoryBucket: {
          categoryId: catA,
          categoryIdsInKb: categoryIds,
          defaultCategoryId: null,
        },
      }).map((x) => x.id)
    ).toEqual(["a", "b"]);
  });
});

describe("compareManualSiblings", () => {
  it("orders by sort_order then title", () => {
    const a = art({ id: "a", title: "Z", sort_order: 0 });
    const b = art({ id: "b", title: "A", sort_order: 1 });
    expect(compareManualSiblings(a, b, "asc")).toBeLessThan(0);
    expect(compareManualSiblings(b, a, "desc")).toBeLessThan(0);
  });
});
