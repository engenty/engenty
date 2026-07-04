// Coverage for the `core_api_catalog` SearchIndexProvider factory.
// Pins:
// - filters mapped correctly into `EngentyApiCatalogInput`
// - caller `tenant_id` forwarded to `buildApiCatalog`
// - `markRebuilt()` advances `last_indexed_at`
// - status falls back to last known total when the catalog throws
// - `replaceDocument` / `deleteDocument` are no-ops

import type {
  EngentyApiCatalogInput,
  EngentyApiCatalogResult,
} from "@engenty/ai-core";
import { describe, expect, it, vi } from "vitest";
import {
  CORE_API_CATALOG_PROVIDER_ID,
  createCoreApiCatalogSearchIndexProvider,
} from "../api-catalog-provider.js";

function makeMatch(
  overrides: Partial<EngentyApiCatalogResult["matches"][number]> = {}
): EngentyApiCatalogResult["matches"][number] {
  return {
    id: "contacts_list",
    kind: "tool",
    moduleId: "contacts",
    pluginId: "contacts",
    readOnly: true,
    title: "List contacts",
    toolId: "contacts_list",
    transports: ["rest"],
    ...overrides,
  };
}

describe("createCoreApiCatalogSearchIndexProvider", () => {
  it("forwards filter + caller scope into buildApiCatalog and shapes results", async () => {
    const buildApiCatalog = vi.fn(
      async (params: {
        input: EngentyApiCatalogInput;
        tenantId?: string | null;
      }): Promise<EngentyApiCatalogResult> => ({
        matches: [
          makeMatch(),
          makeMatch({ id: "contacts_create", title: "Create contact" }),
        ],
        total: 2,
      })
    );
    const handle = createCoreApiCatalogSearchIndexProvider({
      buildApiCatalog,
    });
    expect(handle.provider.id).toBe(CORE_API_CATALOG_PROVIDER_ID);

    const response = await handle.provider.search({
      filters: {
        kind: "tool",
        module_id: "contacts",
        read_only_only: true,
        tenant_id: "tenant-1",
      },
      limit: 5,
      query: "list",
    });

    expect(buildApiCatalog).toHaveBeenCalledWith({
      input: expect.objectContaining({
        kind: "tool",
        limit: 5,
        moduleId: "contacts",
        query: "list",
        readOnlyOnly: true,
        // Core capabilities are lexical-only (semantic ranking moved to
        // apps/ai), so the auto-resolved strategy is lexical.
        strategy: "lexical",
      }),
      tenantId: "tenant-1",
    });
    expect(response.total).toBe(2);
    expect(response.results.map((r) => r.item.id)).toEqual([
      "contacts_list",
      "contacts_create",
    ]);
  });

  it("getStatus reports last known total and stamps last_indexed_at via markRebuilt", async () => {
    const buildApiCatalog = vi.fn(
      async (): Promise<EngentyApiCatalogResult> => ({
        matches: [],
        total: 7,
      })
    );
    const handle = createCoreApiCatalogSearchIndexProvider({
      buildApiCatalog,
    });

    const initial = await handle.provider.getStatus?.({});
    expect(initial?.total_count).toBe(7);
    expect(initial?.last_indexed_at).toBeNull();

    handle.markRebuilt();
    const after = await handle.provider.getStatus?.({});
    expect(after?.last_indexed_at).toBeTruthy();
    expect(typeof after?.last_indexed_at).toBe("string");
  });

  it("getStatus falls back to last known total if buildApiCatalog throws", async () => {
    const buildApiCatalog = vi
      .fn<
        (params: {
          input: EngentyApiCatalogInput;
          tenantId?: string | null;
        }) => Promise<EngentyApiCatalogResult>
      >()
      .mockResolvedValueOnce({ matches: [], total: 12 })
      .mockRejectedValueOnce(new Error("boom"));
    const handle = createCoreApiCatalogSearchIndexProvider({
      buildApiCatalog,
    });

    const first = await handle.provider.getStatus?.({});
    expect(first?.total_count).toBe(12);

    const second = await handle.provider.getStatus?.({});
    expect(second?.total_count).toBe(12);
  });

  it("replaceDocument / deleteDocument are no-ops; backfill stamps last_indexed_at", async () => {
    const buildApiCatalog = vi.fn(
      async (): Promise<EngentyApiCatalogResult> => ({
        matches: [],
        total: 0,
      })
    );
    const handle = createCoreApiCatalogSearchIndexProvider({
      buildApiCatalog,
    });
    await expect(
      handle.provider.replaceDocument?.({} as never)
    ).resolves.toBeUndefined();
    await expect(
      handle.provider.deleteDocument?.({} as never)
    ).resolves.toBeUndefined();
    const result = await handle.provider.backfill?.({} as never);
    expect(result).toEqual({ failed: 0, processed: 0, results: [] });
    const status = await handle.provider.getStatus?.({});
    expect(status?.last_indexed_at).toBeTruthy();
  });
});
