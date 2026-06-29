import { describe, expect, it, vi } from "vitest";
import {
  buildEngentyApiCatalogTool,
  ENGENTY_API_CATALOG_TOOL_ID,
} from "../index.js";

describe("buildEngentyApiCatalogTool", () => {
  it("returns an error when tool access is unavailable", async () => {
    const tool = buildEngentyApiCatalogTool({
      action: "chat",
      moduleId: "copilot",
      scope: null,
      scopeId: "default",
      tenantId: null,
    });

    const result = await tool.execute?.({ query: "current user", limit: 5 });

    expect(result).toEqual({ error: "Tool caller not available" });
  });

  it("forwards discovery requests to the core catalog tool", async () => {
    const callGatewayMethod = vi.fn(async () => ({
      matches: [
        {
          id: "GET /api/users/u-self",
          kind: "http_route",
          method: "get",
          path: "/api/users/u-self",
          readOnly: true,
          title: "Current user",
        },
      ],
      total: 1,
    }));
    const tool = buildEngentyApiCatalogTool({
      action: "chat",
      callGatewayMethod,
      moduleId: "copilot",
      scope: null,
      scopeId: "default",
      tenantId: "tenant-1",
    });

    const result = await tool.execute?.({
      moduleId: "users",
      pluginId: "core",
      query: "current user",
      readOnlyOnly: true,
      strategy: "hybrid",
    });

    expect(callGatewayMethod).toHaveBeenCalledWith(
      ENGENTY_API_CATALOG_TOOL_ID,
      {
        moduleId: "users",
        pluginId: "core",
        query: "current user",
        readOnlyOnly: true,
        strategy: "hybrid",
      }
    );
    expect(result).toEqual({
      matches: [
        {
          id: "GET /api/users/u-self",
          kind: "http_route",
          method: "get",
          path: "/api/users/u-self",
          readOnly: true,
          title: "Current user",
        },
      ],
      total: 1,
    });
  });
});
