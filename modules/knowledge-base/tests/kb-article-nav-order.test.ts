import { describe, expect, it } from "vitest";
import { flattenKbArticleReadingOrder } from "../src/dal/kb-article-nav-order.js";

describe("flattenKbArticleReadingOrder", () => {
  it("orders roots before children (pre-order) in one forest", () => {
    const articles = [
      {
        id: "a",
        title: "A",
        parent_article_id: null,
        sort_order: 0,
      },
      {
        id: "b",
        title: "B",
        parent_article_id: "a",
        sort_order: 0,
      },
      {
        id: "c",
        title: "C",
        parent_article_id: null,
        sort_order: 1,
      },
    ];
    const ids = flattenKbArticleReadingOrder(articles).map((x) => x.id);
    expect(ids).toEqual(["a", "b", "c"]);
  });

  it("orders multiple root trees by sort_order then title", () => {
    const articles = [
      {
        id: "u1",
        title: "U",
        parent_article_id: null,
        sort_order: 2,
      },
      {
        id: "r1",
        title: "R",
        parent_article_id: null,
        sort_order: 0,
      },
      {
        id: "ch",
        title: "CH",
        parent_article_id: "r1",
        sort_order: 0,
      },
    ];
    const ids = flattenKbArticleReadingOrder(articles).map((x) => x.id);
    expect(ids).toEqual(["r1", "ch", "u1"]);
  });

  it("treats parent not in set as root in forest (matches sidebar)", () => {
    const articles = [
      {
        id: "orph",
        title: "Orph",
        parent_article_id: "elsewhere",
        sort_order: 0,
      },
      {
        id: "root",
        title: "Root",
        parent_article_id: null,
        sort_order: 1,
      },
    ];
    const ids = flattenKbArticleReadingOrder(articles).map((x) => x.id);
    expect(ids).toEqual(["orph", "root"]);
  });
});
