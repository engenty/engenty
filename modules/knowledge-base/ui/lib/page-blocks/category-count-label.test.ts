import { describe, expect, it } from "vitest";
import {
  categoryCountNeedsArticles,
  renderCategoryCountLabel,
} from "./category-count-label.js";

const t = (key: string, opts?: { count?: number }) => {
  const count = opts?.count ?? 0;
  if (key === "page_blocks.categories.count") {
    return count === 1 ? `${count} article` : `${count} articles`;
  }
  return key;
};

describe("renderCategoryCountLabel", () => {
  it("returns null when display is none", () => {
    expect(renderCategoryCountLabel(t, 3, 10, "none")).toBeNull();
  });

  it("uses direct count for direct display", () => {
    expect(renderCategoryCountLabel(t, 2, 10, "direct")).toBe("2 articles");
  });

  it("uses recursive count for recursive display", () => {
    expect(renderCategoryCountLabel(t, 2, 10, "recursive")).toBe("10 articles");
  });
});

describe("categoryCountNeedsArticles", () => {
  it("is false only for none", () => {
    expect(categoryCountNeedsArticles("none")).toBe(false);
    expect(categoryCountNeedsArticles("direct")).toBe(true);
    expect(categoryCountNeedsArticles("recursive")).toBe(true);
  });
});
