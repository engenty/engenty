import { describe, expect, it } from "vitest";
import { createKbSidebarLiveBindings } from "./kb-live-cache.js";
import { kbArticleKeys, kbCategoryKeys } from "./queries.js";

describe("createKbSidebarLiveBindings", () => {
  it("returns empty list when kbId is missing", () => {
    expect(createKbSidebarLiveBindings("")).toEqual([]);
  });

  it("subscribes to articles and categories postgres changes", () => {
    const [binding] = createKbSidebarLiveBindings("kb-1");
    expect(binding?.id).toBe("kb_sidebar");
    expect(binding?.postgresChanges).toEqual([
      { schema: "module_kb", table: "articles" },
      { schema: "module_kb", table: "categories" },
    ]);
  });

  it("maps category signals to the category list key for that kb", () => {
    const [binding] = createKbSidebarLiveBindings("kb-1");
    expect(
      binding?.resolveQueryKeys(
        { tenantId: "tenant-1" },
        {
          kind: "postgres_changes",
          schema: "module_kb",
          table: "categories",
          record: { kb_id: "kb-1" },
        }
      )
    ).toEqual([kbCategoryKeys.list("kb-1")]);
  });

  it("maps article signals to the article namespace", () => {
    const [binding] = createKbSidebarLiveBindings("kb-1");
    expect(
      binding?.resolveQueryKeys(
        { tenantId: "tenant-1" },
        {
          kind: "postgres_changes",
          schema: "module_kb",
          table: "articles",
          record: { kb_id: "kb-1" },
        }
      )
    ).toEqual([kbArticleKeys.all]);
  });

  it("ignores rows belonging to a different kb", () => {
    const [binding] = createKbSidebarLiveBindings("kb-1");
    expect(
      binding?.resolveQueryKeys(
        { tenantId: "tenant-1" },
        {
          kind: "postgres_changes",
          schema: "module_kb",
          table: "articles",
          record: { kb_id: "kb-2" },
        }
      )
    ).toEqual([]);
  });

  it("falls back to broad invalidation when kb_id is not in payload", () => {
    const [binding] = createKbSidebarLiveBindings("kb-1");
    expect(
      binding?.resolveQueryKeys(
        { tenantId: "tenant-1" },
        {
          kind: "postgres_changes",
          schema: "module_kb",
          table: "articles",
        }
      )
    ).toEqual([kbArticleKeys.all]);
  });
});
