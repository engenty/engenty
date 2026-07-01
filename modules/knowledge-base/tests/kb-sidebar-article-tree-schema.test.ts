import { describe, expect, it } from "vitest";
import {
  KB_SIDEBAR_ARTICLE_TREE_DEFAULTS,
  mergeKbSidebarArticleTreePrefs,
  mergeKbSidebarArticleTreeUserPrefs,
  parseKbSidebarArticleTreeDefaultsFromRow,
} from "../src/schema/kb-sidebar-article-tree.js";

describe("mergeKbSidebarArticleTreePrefs", () => {
  it("fills from code defaults when empty", () => {
    expect(mergeKbSidebarArticleTreePrefs(null)).toEqual(
      KB_SIDEBAR_ARTICLE_TREE_DEFAULTS
    );
    expect(mergeKbSidebarArticleTreePrefs({})).toEqual(
      KB_SIDEBAR_ARTICLE_TREE_DEFAULTS
    );
  });

  it("applies partial overrides", () => {
    expect(
      mergeKbSidebarArticleTreePrefs({
        viewMode: "list",
        maxPerLevel: 50,
      })
    ).toEqual({
      ...KB_SIDEBAR_ARTICLE_TREE_DEFAULTS,
      viewMode: "list",
      maxPerLevel: 50,
    });
  });
});

describe("mergeKbSidebarArticleTreeUserPrefs", () => {
  const kbBase = mergeKbSidebarArticleTreePrefs({
    viewMode: "list",
    sortBy: "title",
    sortOrder: "asc",
    maxPerLevel: 10,
  });

  it("uses KB defaults when user partial is empty", () => {
    expect(mergeKbSidebarArticleTreeUserPrefs(null, kbBase)).toEqual(kbBase);
  });

  it("lets user override individual fields", () => {
    expect(
      mergeKbSidebarArticleTreeUserPrefs({ sortBy: "manual" }, kbBase)
    ).toEqual({ ...kbBase, sortBy: "manual" });
  });
});

describe("parseKbSidebarArticleTreeDefaultsFromRow", () => {
  it("returns code defaults for invalid row data", () => {
    expect(parseKbSidebarArticleTreeDefaultsFromRow(null)).toEqual(
      KB_SIDEBAR_ARTICLE_TREE_DEFAULTS
    );
    expect(parseKbSidebarArticleTreeDefaultsFromRow([])).toEqual(
      KB_SIDEBAR_ARTICLE_TREE_DEFAULTS
    );
    expect(
      parseKbSidebarArticleTreeDefaultsFromRow({ sortBy: "nope" })
    ).toEqual(KB_SIDEBAR_ARTICLE_TREE_DEFAULTS);
  });
});
