import { describe, expect, it } from "vitest";
import { KB_CATEGORY_PAGE_SETTINGS_DEFAULTS } from "../src/schema/categories.js";
import type { KbArticleTemplate, KbCategory } from "../src/schema/types.js";
import {
  resolveKbTemplateForArticle,
  resolveKbTemplateForCategory,
} from "../src/services/kb-template-resolver.js";

function template(id: string): KbArticleTemplate {
  return {
    id,
    tenant_id: "tenant-1",
    scope_id: "scope-1",
    kb_id: "kb-1",
    name: id,
    description: null,
    property_definitions: [],
    content_json: null,
    content_markdown: null,
    created_at: "",
    updated_at: "",
    deleted_at: null,
  };
}

function category(id: string, partial: Partial<KbCategory> = {}): KbCategory {
  return {
    id,
    tenant_id: "tenant-1",
    scope_id: "scope-1",
    kb_id: "kb-1",
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
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

describe("kb template resolver", () => {
  it("resolves the nearest category template", async () => {
    const t1 = template("tpl-1");
    const cats = new Map([
      [
        "root",
        category("root", { template_mode: "template", template_id: t1.id }),
      ],
      ["child", category("child", { parent_id: "root" })],
    ]);
    const repos = {
      categories: { getById: async (id: string) => cats.get(id) ?? null },
      templates: { getById: async (id: string) => (id === t1.id ? t1 : null) },
    };

    const resolved = await resolveKbTemplateForCategory(
      repos as never,
      cats.get("child")!
    );

    expect(resolved.template?.id).toBe("tpl-1");
    expect(resolved.source_category_id).toBe("root");
  });

  it("lets an article explicit none stop category inheritance", async () => {
    const t1 = template("tpl-1");
    const cat = category("cat", {
      template_mode: "template",
      template_id: t1.id,
    });
    const repos = {
      categories: { getById: async () => cat },
      templates: { getById: async () => t1 },
    };

    const resolved = await resolveKbTemplateForArticle(repos as never, {
      category_id: cat.id,
      template_id: null,
      template_mode: "none",
    });

    expect(resolved.template).toBeNull();
    expect(resolved.source).toBe("disabled");
  });
});
