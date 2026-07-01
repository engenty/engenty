import { describe, expect, it } from "vitest";
import { KB_CATEGORY_PAGE_SETTINGS_DEFAULTS } from "../src/schema/categories.js";
import type { KbArticleTemplate, KbCategory } from "../src/schema/types.js";
import {
  resolveKbEffectiveTemplateClient,
  resolveKbEffectiveTemplateForCategoryClient,
} from "../ui/lib/kb-effective-template.js";

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

function template(id: string, name: string): KbArticleTemplate {
  return {
    id,
    tenant_id: "t1",
    scope_id: "s1",
    kb_id: "kb1",
    name,
    description: null,
    property_definitions: [],
    content_json: null,
    content_markdown: null,
    created_at: "",
    updated_at: "",
    deleted_at: null,
  };
}

describe("resolveKbEffectiveTemplateClient", () => {
  it("returns inherited category template for inherit mode", () => {
    const categories = [
      category("cat-a", {
        template_mode: "template",
        template_id: "tpl-a",
      }),
    ];
    const templates = [template("tpl-a", "Course page")];

    expect(
      resolveKbEffectiveTemplateClient(categories, templates, {
        category_id: "cat-a",
        template_id: null,
        template_mode: "inherit",
      })?.name
    ).toBe("Course page");
  });

  it("returns null when binding is explicitly none", () => {
    expect(
      resolveKbEffectiveTemplateClient([], [], {
        category_id: "cat-a",
        template_id: null,
        template_mode: "none",
      })
    ).toBeNull();
  });
});

describe("resolveKbEffectiveTemplateForCategoryClient", () => {
  it("inherits template from parent category", () => {
    const categories = [
      category("parent", {
        template_mode: "template",
        template_id: "tpl-a",
      }),
      category("child", {
        parent_id: "parent",
        template_mode: "inherit",
      }),
    ];
    const templates = [template("tpl-a", "Course page")];

    expect(
      resolveKbEffectiveTemplateForCategoryClient(
        categories,
        templates,
        categories[1]!
      )?.name
    ).toBe("Course page");
  });

  it("returns direct template when category binds explicitly", () => {
    const categories = [
      category("cat-a", {
        template_mode: "template",
        template_id: "tpl-b",
      }),
    ];
    const templates = [template("tpl-b", "Article page")];

    expect(
      resolveKbEffectiveTemplateForCategoryClient(
        categories,
        templates,
        categories[0]!
      )?.name
    ).toBe("Article page");
  });
});
