import { describe, expect, it } from "vitest";
import { KB_CATEGORY_PAGE_SETTINGS_DEFAULTS } from "../schema/categories.js";
import { KB_HUB_PAGE_LAYOUT_DEFAULTS } from "../schema/page-blocks.js";
import type { Article, KbCategory, KnowledgeBase } from "../schema/types.js";
import { resolveKbEffectiveCommentsModeFromData } from "./kb-effective-comments-mode.js";

function kb(
  comments_mode: KnowledgeBase["comments_mode"] = "enabled"
): KnowledgeBase {
  return {
    id: "kb-1",
    comments_mode,
    article_property_definitions: [],
    cover: null,
    chunking: null,
    created_at: "",
    created_by: null,
    deleted_at: null,
    description: null,
    icon: null,
    name: "KB",
    page_layout: { ...KB_HUB_PAGE_LAYOUT_DEFAULTS },
    space_id: "space-1",
    scope_id: "scope",
    slug: "default",
    tenant_id: "tenant",
    updated_at: "",
  };
}

function category(
  id: string,
  parent_id: string | null,
  comments_mode: KbCategory["comments_mode"] = "inherit"
): KbCategory {
  return {
    id,
    comments_mode,
    cover: null,
    cover_inheritance: "none",
    created_at: "",
    description: null,
    icon: null,
    intro_json: null,
    intro_markdown: null,
    is_default: id === "general",
    kb_id: "kb-1",
    name: id,
    outro_json: null,
    outro_markdown: null,
    page_settings: { ...KB_CATEGORY_PAGE_SETTINGS_DEFAULTS },
    parent_id,
    scope_id: "scope",
    slug: id,
    sort_order: 0,
    template_id: null,
    template_mode: "inherit",
    tenant_id: "tenant",
    updated_at: "",
    view_type: "folder",
  };
}

function article(
  comments_mode: Article["comments_mode"] = "inherit",
  category_id = "general"
): Pick<Article, "category_id" | "comments_mode"> {
  return { category_id, comments_mode };
}

describe("resolveKbEffectiveCommentsModeFromData", () => {
  it("uses article override when set", () => {
    expect(
      resolveKbEffectiveCommentsModeFromData(
        kb("enabled"),
        [category("general", null)],
        article("none")
      )
    ).toBe("none");
  });

  it("walks category parent chain on inherit", () => {
    const categories = [
      category("general", null, "inherit"),
      category("child", "general", "inherit"),
      category("grandchild", "child", "closed"),
    ];
    expect(
      resolveKbEffectiveCommentsModeFromData(
        kb("enabled"),
        categories,
        article("inherit", "child")
      )
    ).toBe("enabled");
    expect(
      resolveKbEffectiveCommentsModeFromData(
        kb("enabled"),
        categories,
        article("inherit", "grandchild")
      )
    ).toBe("closed");
  });

  it("falls back to KB default", () => {
    expect(
      resolveKbEffectiveCommentsModeFromData(
        kb("none"),
        [category("general", null, "inherit")],
        article("inherit")
      )
    ).toBe("none");
  });
});
