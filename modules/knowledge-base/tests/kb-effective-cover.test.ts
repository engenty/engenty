import { describe, expect, it } from "vitest";
import { KB_CATEGORY_PAGE_SETTINGS_DEFAULTS } from "../src/schema/categories.js";
import type { KbCategory } from "../src/schema/types.js";
import { resolveKbInheritedCoverFromData } from "../src/services/kb-effective-cover.js";

function category(id: string, partial: Partial<KbCategory> = {}): KbCategory {
  return {
    id,
    tenant_id: "t1",
    scope_id: "s1",
    kb_id: "kb1",
    parent_id: null,
    name: id,
    slug: id,
    description: null,
    sort_order: 0,
    comments_mode: "inherit",
    template_mode: "inherit",
    template_id: null,
    is_default: false,
    cover: null,
    cover_inheritance: "none",
    intro_json: null,
    intro_markdown: null,
    outro_json: null,
    outro_markdown: null,
    view_type: "collection",
    page_settings: { ...KB_CATEGORY_PAGE_SETTINGS_DEFAULTS },
    icon: null,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

const coverColor = { type: "color" as const, value: "var(--primary)" };

describe("resolveKbInheritedCoverFromData", () => {
  it("returns null when no category exposes inheritance", () => {
    const categories = [
      category("a", { cover: coverColor, cover_inheritance: "none" }),
    ];
    expect(resolveKbInheritedCoverFromData(categories, "a")).toBeNull();
  });

  it("applies direct_articles only to articles in that category", () => {
    const categories = [
      category("parent", {
        parent_id: null,
        cover: coverColor,
        cover_inheritance: "direct_articles",
      }),
      category("child", { parent_id: "parent" }),
    ];
    expect(resolveKbInheritedCoverFromData(categories, "parent")).toEqual(
      coverColor
    );
    expect(resolveKbInheritedCoverFromData(categories, "child")).toBeNull();
  });

  it("applies all_children to descendant category articles", () => {
    const parentCover = { type: "color" as const, value: "var(--accent)" };
    const categories = [
      category("parent", {
        cover: parentCover,
        cover_inheritance: "all_children",
      }),
      category("child", { parent_id: "parent" }),
    ];
    expect(resolveKbInheritedCoverFromData(categories, "child")).toEqual(
      parentCover
    );
  });

  it("prefers the nearest ancestor with an applicable cover", () => {
    const childCover = { type: "color" as const, value: "var(--card)" };
    const categories = [
      category("parent", {
        cover: coverColor,
        cover_inheritance: "all_children",
      }),
      category("child", {
        parent_id: "parent",
        cover: childCover,
        cover_inheritance: "direct_articles",
      }),
    ];
    expect(resolveKbInheritedCoverFromData(categories, "child")).toEqual(
      childCover
    );
  });
});
