import { describe, expect, it } from "vitest";
import {
  buildKbArticleParentChain,
  type KbNavArticleRow,
} from "./kb-article-nav-order.js";

function row(
  id: string,
  parent_article_id: string | null,
  sort_order = 0
): KbNavArticleRow {
  return { id, parent_article_id, slug: `${id}-slug`, sort_order, title: id };
}

describe("buildKbArticleParentChain", () => {
  it("returns ancestors outermost first", () => {
    const rows = [row("a", null), row("b", "a"), row("c", "b")];
    expect(buildKbArticleParentChain(rows, "c").map((p) => p.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("is empty for a top-level article", () => {
    expect(buildKbArticleParentChain([row("a", null)], "a")).toEqual([]);
  });

  it("stops at an ancestor missing from the set", () => {
    const rows = [row("b", "gone"), row("c", "b")];
    expect(buildKbArticleParentChain(rows, "c").map((p) => p.id)).toEqual([
      "b",
    ]);
  });

  it("stops on a cycle", () => {
    const rows = [row("a", "b"), row("b", "a")];
    expect(buildKbArticleParentChain(rows, "a").map((p) => p.id)).toEqual([
      "b",
    ]);
  });

  it("carries the slug the breadcrumb links to", () => {
    const rows = [row("a", null), row("b", "a")];
    expect(buildKbArticleParentChain(rows, "b")[0]?.slug).toBe("a-slug");
  });
});
