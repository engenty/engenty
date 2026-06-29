import { ENGENTY_API_CATALOG_TOOL_ID } from "@engenty/ai-core";
import { describe, expect, it, vi } from "vitest";
import { buildEngentyApiCatalogMethod } from "../api-catalog/catalog-method.js";

describe("buildEngentyApiCatalogMethod", () => {
  it("delegates to getApiCatalog", async () => {
    const getApiCatalog = vi.fn().mockReturnValue({
      matches: [],
      total: 0,
    });
    const method = buildEngentyApiCatalogMethod(getApiCatalog);
    expect(method.name).toBe(ENGENTY_API_CATALOG_TOOL_ID);
    const input = { query: "users", limit: 5 };
    const auth = {
      principalId: "user-1",
      scopeId: "default",
      tenantId: "tenant-1",
    };
    const result = await method.handler(input, {
      config: {},
      pluginConfig: {},
      dataDir: "",
      resolvePath: (p) => p,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
      auth,
    });
    expect(getApiCatalog).toHaveBeenCalledWith(input, auth);
    expect(result).toEqual({ matches: [], total: 0 });
  });
});
