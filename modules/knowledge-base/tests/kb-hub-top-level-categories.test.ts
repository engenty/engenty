import { describe, expect, it } from "vitest";
import { KB_CATEGORY_PAGE_SETTINGS_DEFAULTS } from "../src/schema/categories.js";
import type { KbCategory } from "../src/schema/types.js";
import { listTopLevelCategories } from "../ui/lib/kb-hub-top-level-categories.js";

function cat(partial: Partial<KbCategory> & { id: string }): KbCategory {
  return {
    cover: null,
    cover_inheritance: "none",
    created_at: "2026-01-01T00:00:00Z",
    description: null,
    icon: null,
    id: partial.id,
    intro_json: null,
    intro_markdown: null,
    is_default: false,
    kb_id: "kb-1",
    name: partial.name ?? partial.id,
    outro_json: null,
    outro_markdown: null,
    page_settings: KB_CATEGORY_PAGE_SETTINGS_DEFAULTS,
    parent_id: partial.parent_id ?? null,
    scope_id: "scope",
    slug: partial.slug ?? partial.id,
    sort_order: partial.sort_order ?? 0,
    template_id: null,
    template_mode: "inherit",
    tenant_id: "tenant-1",
    updated_at: "2026-01-01T00:00:00Z",
    view_type: "folder",
    ...partial,
  };
}

describe("listTopLevelCategories", () => {
  it("returns root categories except the default bucket", () => {
    const rows = listTopLevelCategories([
      cat({ id: "general", is_default: true, name: "General" }),
      cat({ id: "a", name: "Ausbildungen", slug: "ausbildungen" }),
      cat({
        id: "child",
        name: "Child",
        parent_id: "a",
        slug: "child",
      }),
    ]);
    expect(rows.map((c) => c.id)).toEqual(["a"]);
  });
});
