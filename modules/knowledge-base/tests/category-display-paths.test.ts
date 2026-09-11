import { describe, expect, it } from "vitest";
import type { KbCategory } from "../src/schema/types.js";
import {
  buildCategoryAncestorChain,
  buildCategoryTreeBreadcrumbCrumbs,
} from "../ui/lib/category-display-paths.js";

function cat(partial: Partial<KbCategory> & Pick<KbCategory, "id" | "name">) {
  return {
    cover: null,
    cover_inheritance: "none",
    created_at: "2026-01-01T00:00:00.000Z",
    description: null,
    icon: null,
    intro_json: null,
    intro_markdown: null,
    is_default: false,
    kb_id: "kb-1",
    outro_json: null,
    outro_markdown: null,
    page_settings: {} as KbCategory["page_settings"],
    parent_id: null,
    slug: partial.name.toLowerCase().replace(/\s+/g, "-"),
    sort_order: 0,
    template_id: null,
    template_mode: "inherit" as const,
    updated_at: "2026-01-01T00:00:00.000Z",
    view_type: "folder" as const,
    ...partial,
  } satisfies KbCategory;
}

describe("category breadcrumb paths", () => {
  it("builds ancestor chain for nested categories", () => {
    const root = cat({ id: "root", name: "Ausbildungen" });
    const leaf = cat({
      id: "leaf",
      name: "Ausbildungen Detailseiten",
      parent_id: "root",
    });
    expect(buildCategoryAncestorChain(leaf, [root, leaf])).toEqual([root]);
  });

  it("omits default category from tree breadcrumbs", () => {
    const general = cat({ id: "general", name: "General", is_default: true });
    expect(
      buildCategoryTreeBreadcrumbCrumbs(general, [general], "default")
    ).toEqual([]);
  });

  it("returns linked ancestor crumbs and plain current leaf", () => {
    const root = cat({
      id: "root",
      name: "Ausbildungen",
      slug: "ausbildungen",
    });
    const leaf = cat({
      id: "leaf",
      name: "Ausbildungen Detailseiten",
      slug: "ausbildungen-detailseiten",
      parent_id: "root",
    });
    const crumbs = buildCategoryTreeBreadcrumbCrumbs(leaf, [root, leaf]);
    expect(crumbs).toHaveLength(2);
    expect(crumbs[0]?.to).toBe("/mdl/knowledge-base/c/ausbildungen");
    expect(crumbs[1]?.label).toBe("Ausbildungen Detailseiten");
    expect(crumbs[1]?.to).toBeUndefined();
  });
});
