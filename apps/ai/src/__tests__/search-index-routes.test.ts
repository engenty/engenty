// Coverage for the apps/ai per-user `/ai/v1/search-index/*` surface.
// Pins: caller-scope auto-applied to status/backfill/search, system
// providers gated to superadmin, missing-provider 404, and the search
// route's filter merging (caller scope wins over body filters).

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

const scopeResolver = createStaticAiScopeResolver({
  tenantId,
  userId,
});

const superadminScopeResolver = createStaticAiScopeResolver({
  isSuperAdmin: true,
  tenantId,
  userId,
});

function makeProvider(
  overrides: Partial<SearchIndexProvider> = {}
): SearchIndexProvider {
  return {
    backfill: vi.fn(async () => ({ failed: 0, processed: 0, results: [] })),
    capabilities: { hybrid: true, lexical: true, semantic: true },
    deleteDocument: vi.fn(async () => {}),
    getStatus: vi.fn(async () => ({
      current_count: 1,
      indexed_count: 1,
      last_indexed_at: "2026-05-21T00:00:00.000Z",
      missing_count: 0,
      stale_count: 0,
      total_count: 1,
    })),
    id: "ai_chat_search",
    replaceDocument: vi.fn(async () => {}),
    search: vi.fn(async () => ({
      results: [{ doc_id: "chat-1" }],
      total: 1,
    })),
    version: "1",
    ...overrides,
  } as SearchIndexProvider;
}

function setupApp(opts: {
  registry: ReturnType<typeof createSearchIndexRegistry>;
  resolver?: typeof scopeResolver;
}) {
  const app = new Hono();
  registerAppsAiSearchIndexRoutes(app as never, {
    resolveRegistry: () => opts.registry,
    scopeResolver: opts.resolver ?? scopeResolver,
  });
  return app;
}

describe("apps/ai /ai/v1/search-index routes", () => {
  it("GET /providers returns visible providers (system providers hidden for non-admin)", async () => {
    const registry = createSearchIndexRegistry();
    registry.register(makeProvider({ id: "ai_chat_search" }), {
      entityName: "chat_session",
      moduleId: "ai",
    });
    registry.register(makeProvider({ id: "core_api_catalog" }), {
      entityName: "api_method",
      isSystem: true,
      moduleId: "core",
    });
    const app = setupApp({ registry });

    const res = await app.request("/ai/v1/search-index/providers", {
      headers: { Authorization: "Bearer user-token" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      providers: Array<{ id: string; is_system: boolean }>;
    };
    expect(body.providers.map((p) => p.id)).toEqual(["ai_chat_search"]);
  });

  it("GET /providers returns system providers to superadmins", async () => {
    const registry = createSearchIndexRegistry();
    registry.register(makeProvider({ id: "ai_chat_search" }), {
      entityName: "chat_session",
      moduleId: "ai",
    });
    registry.register(makeProvider({ id: "core_api_catalog" }), {
      entityName: "api_method",
      isSystem: true,
      moduleId: "core",
    });
    const app = setupApp({ registry, resolver: superadminScopeResolver });

    const res = await app.request("/ai/v1/search-index/providers", {
      headers: { Authorization: "Bearer admin-token" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      providers: Array<{ id: string }>;
    };
    expect(body.providers.map((p) => p.id).sort()).toEqual([
      "ai_chat_search",
      "core_api_catalog",
    ]);
  });

  it("GET /providers/:id/status auto-applies caller scope", async () => {
    const provider = makeProvider();
    const registry = createSearchIndexRegistry();
    registry.register(provider, {
      entityName: "chat_session",
      moduleId: "ai",
    });
    const app = setupApp({ registry });

    const res = await app.request(
      "/ai/v1/search-index/providers/ai_chat_search/status",
      { headers: { Authorization: "Bearer user-token" } }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      status: { indexed_count: number; total_count: number };
    };
    expect(body.id).toBe("ai_chat_search");
    expect(body.status.total_count).toBe(1);
    expect(provider.getStatus).toHaveBeenCalledWith({
      tenant_id: tenantId,
      user_id: userId,
    });
  });

  it("GET /providers/:id/status returns 404 for unknown provider", async () => {
    const registry = createSearchIndexRegistry();
    const app = setupApp({ registry });

    const res = await app.request(
      "/ai/v1/search-index/providers/missing/status",
      { headers: { Authorization: "Bearer user-token" } }
    );
    expect(res.status).toBe(404);
  });

  it("GET /providers/:id/status hides system providers from non-admin", async () => {
    const provider = makeProvider({ id: "core_api_catalog" });
    const registry = createSearchIndexRegistry();
    registry.register(provider, {
      entityName: "api_method",
      isSystem: true,
      moduleId: "core",
    });
    const app = setupApp({ registry });

    const res = await app.request(
      "/ai/v1/search-index/providers/core_api_catalog/status",
      { headers: { Authorization: "Bearer user-token" } }
    );
    expect(res.status).toBe(403);
  });

  it("POST /providers/:id/backfill caps limit and forwards caller scope", async () => {
    const provider = makeProvider();
    const registry = createSearchIndexRegistry();
    registry.register(provider, {
      entityName: "chat_session",
      moduleId: "ai",
    });
    const app = setupApp({ registry });

    const res = await app.request(
      "/ai/v1/search-index/providers/ai_chat_search/backfill",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: "Bearer user-token",
        },
        body: JSON.stringify({ limit: 50 }),
      }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      result: { processed: number };
    };
    expect(body.id).toBe("ai_chat_search");
    expect(provider.backfill).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 50,
        tenant_id: tenantId,
        user_id: userId,
      })
    );
  });

  it("POST /providers/:id/search merges caller scope into filters and runs the provider", async () => {
    const provider = makeProvider();
    const registry = createSearchIndexRegistry();
    registry.register(provider, {
      entityName: "chat_session",
      moduleId: "ai",
    });
    const app = setupApp({ registry });

    const res = await app.request(
      "/ai/v1/search-index/providers/ai_chat_search/search",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: "Bearer user-token",
        },
        body: JSON.stringify({
          // The body's `tenant_id` is ignored — caller scope wins.
          filters: { agent_id: "engenty.copilot", tenant_id: "evil-tenant" },
          limit: 10,
          query: "ada",
        }),
      }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      matches: Array<{ doc_id: string }>;
      total: number;
    };
    expect(body.total).toBe(1);
    expect(body.matches).toEqual([{ doc_id: "chat-1" }]);
    expect(provider.search).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: {
          agent_id: "engenty.copilot",
          tenant_id: tenantId,
          user_id: userId,
        },
        limit: 10,
        query: "ada",
        strategy: "hybrid",
      })
    );
  });

  it("rejects unauthenticated callers across all routes", async () => {
    const registry = createSearchIndexRegistry();
    registry.register(makeProvider(), {
      entityName: "chat_session",
      moduleId: "ai",
    });
    // Resolver that always 401s when no Authorization header is present.
    const app = new Hono();
    registerAppsAiSearchIndexRoutes(app as never, {
      resolveRegistry: () => registry,
      scopeResolver: async ({ authorization }) =>
        authorization
          ? { ok: true, scope: { tenantId, userId } }
          : { error: "unauthorized", ok: false, status: 401 },
    });

    for (const path of [
      "/ai/v1/search-index/providers",
      "/ai/v1/search-index/providers/ai_chat_search/status",
    ]) {
      const res = await app.request(path);
      expect(res.status).toBe(401);
    }
  });
});
