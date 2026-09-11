import { describe, expect, it } from "vitest";
import {
  isKbArticlesListNavPath,
  isKbFaqsListNavPath,
  isKbHubStartPath,
  isKbSidebarArticleRoute,
  isKbSidebarFaqRoute,
  isKbSidebarFavoritesRoute,
} from "../ui/lib/kb-sidebar-paths.js";

const BASE = "/mdl/knowledge-base";

describe("kb-sidebar-paths", () => {
  it("detects hub start routes", () => {
    expect(isKbHubStartPath(BASE)).toBe(true);
    expect(isKbHubStartPath(`${BASE}/chat`)).toBe(true);
    expect(isKbHubStartPath(`${BASE}/articles`)).toBe(false);
  });

  it("detects top nav list routes", () => {
    expect(isKbArticlesListNavPath(`${BASE}/articles`)).toBe(true);
    expect(isKbFaqsListNavPath(`${BASE}/faqs`)).toBe(true);
  });

  it("maps FAQ routes to the FAQs tab", () => {
    expect(isKbSidebarFaqRoute(`${BASE}/faqs`)).toBe(true);
    expect(isKbSidebarFaqRoute(`${BASE}/faqs/abc/edit`)).toBe(true);
  });

  it("maps article routes to the Articles tab", () => {
    expect(isKbSidebarArticleRoute(`${BASE}/articles`)).toBe(true);
    expect(isKbSidebarArticleRoute(`${BASE}/c/guides`)).toBe(true);
    expect(
      isKbSidebarArticleRoute(`${BASE}/550e8400-e29b-41d4-a716-446655440000`)
    ).toBe(true);
    expect(isKbSidebarArticleRoute(`${BASE}/sources`)).toBe(false);
    expect(isKbSidebarArticleRoute(`${BASE}/favorites`)).toBe(false);
    expect(isKbSidebarArticleRoute(BASE)).toBe(false);
  });

  it("maps favorites routes to the Favorites tab", () => {
    expect(isKbSidebarFavoritesRoute(`${BASE}/favorites`)).toBe(true);
    expect(isKbSidebarFavoritesRoute(`${BASE}/favorites/item-1`)).toBe(true);
  });
});
