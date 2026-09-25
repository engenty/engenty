import {
  createSearchIndexRegistry,
  type SearchIndexProvider,
} from "@engenty/search-index";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createStaticAiScopeResolver } from "../api/http.js";
import { registerAppsAiSearchIndexRoutes } from "../api/search-index-routes.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";

function makeProvider(
  overrides: Partial<SearchIndexProvider> = {}
): SearchIndexProvider {
  return {
    capabilities: { hybrid: true, lexical: true, semantic: true },
    getStatus: vi.fn(async () => ({})),
    id: "ai_chat_search",
    search: vi.fn(async () => ({ results: [], total: 0 })),
    version: "1",
    ...overrides,
  } as unknown as SearchIndexProvider;
}

function setupApp(
  registry: ReturnType<typeof createSearchIndexRegistry>,
  scopeResolver: Parameters<
    typeof registerAppsAiSearchIndexRoutes
  >[1]["scopeResolver"] = createStaticAiScopeResolver({ tenantId, userId })
) {
  const app = new Hono();
  registerAppsAiSearchIndexRoutes(app as never, {
    resolveRegistry: () => registry,
    scopeResolver,
  });
  return app;
}

describe("apps/ai /ai/v1/search-index routes", () => {
  it("forbids a system provider to a non-admin", async () => {
    const registry = createSearchIndexRegistry();
    registry.register(makeProvider({ id: "core_api_catalog" }), {
      entityName: "api_method",
      isSystem: true,
      moduleId: "core",
    });

    const res = await setupApp(registry).request(
      "/ai/v1/search-index/providers/core_api_catalog/status",
      { headers: { Authorization: "Bearer user-token" } }
    );

    expect(res.status).toBe(403);
  });

  it("search uses the caller's tenant, not one named in the body", async () => {
    const provider = makeProvider();
    const registry = createSearchIndexRegistry();
    registry.register(provider, { entityName: "chat_session", moduleId: "ai" });

    const res = await setupApp(registry).request(
      "/ai/v1/search-index/providers/ai_chat_search/search",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: "Bearer user-token",
        },
        body: JSON.stringify({
          filters: { tenant_id: "evil-tenant", user_id: "evil-user" },
        }),
      }
    );

    expect(res.status).toBe(200);
    expect(provider.search).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: { tenant_id: tenantId, user_id: userId },
      })
    );
  });

  it("rejects unauthenticated callers", async () => {
    const registry = createSearchIndexRegistry();
    registry.register(makeProvider(), {
      entityName: "chat_session",
      moduleId: "ai",
    });
    const app = setupApp(registry, async ({ authorization }) =>
      authorization
        ? { ok: true, scope: { tenantId, userId } }
        : { error: "unauthorized", ok: false, status: 401 }
    );

    for (const path of [
      "/ai/v1/search-index/providers",
      "/ai/v1/search-index/providers/ai_chat_search/status",
    ]) {
      const res = await app.request(path);
      expect(res.status).toBe(401);
    }
  });
});
