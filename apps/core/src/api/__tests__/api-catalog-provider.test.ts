import type { EngentyApiCatalogResult } from "@engenty/ai-core";
import { describe, expect, it, vi } from "vitest";
import { createCoreApiCatalogSearchIndexProvider } from "../api-catalog-provider.js";

describe("createCoreApiCatalogSearchIndexProvider", () => {
  it("scopes catalog search to the caller's tenant", async () => {
    const buildApiCatalog = vi.fn(
      async (): Promise<EngentyApiCatalogResult> => ({ matches: [], total: 0 })
    );
    const handle = createCoreApiCatalogSearchIndexProvider({ buildApiCatalog });

    await handle.provider.search({
      filters: { tenant_id: "tenant-1" },
      limit: 5,
      query: "list",
    });

    expect(buildApiCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-1" })
    );
  });
});
