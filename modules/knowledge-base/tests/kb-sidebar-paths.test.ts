import { describe, expect, it } from "vitest";
import {
  isKbArticlesListNavPath,
  isKbFaqsListNavPath,
  isKbHubStartPath,
  isKbSidebarArticleRoute,
  isKbSidebarFaqRoute,
  isKbSidebarFavoritesRoute,
} from "../ui/lib/kb-sidebar-paths.js";

const SLUG = "demo-kb";

describe("kb-sidebar-paths", () => {
  it("detects hub start routes", () => {
    expect(isKbHubStartPath(`/mdl/knowledge-base/${SLUG}`, SLUG)).toBe(true);
    expect(isKbHubStartPath(`/mdl/knowledge-base/${SLUG}/chat`, SLUG)).toBe(
      true
    );
    expect(isKbHubStartPath(`/mdl/knowledge-base/${SLUG}/articles`, SLUG)).toBe(
      false
    );
  });

  it("detects top nav list routes", () => {
    expect(
      isKbArticlesListNavPath(`/mdl/knowledge-base/${SLUG}/articles`, SLUG)
    ).toBe(true);
    expect(isKbFaqsListNavPath(`/mdl/knowledge-base/${SLUG}/faqs`, SLUG)).toBe(
      true
    );
  });

  it("maps FAQ routes to the FAQs tab", () => {
    expect(isKbSidebarFaqRoute(`/mdl/knowledge-base/${SLUG}/faqs`, SLUG)).toBe(
      true
    );
    expect(
      isKbSidebarFaqRoute(`/mdl/knowledge-base/${SLUG}/faqs/abc/edit`, SLUG)
    ).toBe(true);
  });

  it("maps article routes to the Articles tab", () => {
    expect(
      isKbSidebarArticleRoute(`/mdl/knowledge-base/${SLUG}/articles`, SLUG)
    ).toBe(true);
    expect(
      isKbSidebarArticleRoute(`/mdl/knowledge-base/${SLUG}/c/guides`, SLUG)
    ).toBe(true);
    expect(
      isKbSidebarArticleRoute(
        `/mdl/knowledge-base/${SLUG}/550e8400-e29b-41d4-a716-446655440000`,
        SLUG
      )
    ).toBe(true);
    expect(
      isKbSidebarArticleRoute(`/mdl/knowledge-base/${SLUG}/sources`, SLUG)
    ).toBe(false);
    expect(
      isKbSidebarArticleRoute(`/mdl/knowledge-base/${SLUG}/favorites`, SLUG)
    ).toBe(false);
  });

  it("maps favorites routes to the Favorites tab", () => {
    expect(
      isKbSidebarFavoritesRoute(`/mdl/knowledge-base/${SLUG}/favorites`, SLUG)
    ).toBe(true);
    expect(
      isKbSidebarFavoritesRoute(
        `/mdl/knowledge-base/${SLUG}/favorites/item-1`,
        SLUG
      )
    ).toBe(true);
  });
});
