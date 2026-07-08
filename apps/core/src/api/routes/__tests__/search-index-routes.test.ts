// Tests for `apps/core/src/api/routes/search-index-routes.ts`.
//
// Covers list/status/backfill happy paths plus the auth gate matrix:
// - tenant-scoped provider visible to tenant admin and superadmin only
// - system provider visible to superadmin only
// - backfill cap enforced; non-superadmin cannot target a foreign tenant.

import {
  createSearchIndexRegistry,
  type SearchIndexProvider,
  type SearchIndexRegistry,
} from "@engenty/search-index";
import { OpenAPIHono } from "@hono/zod-openapi";
import { SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_BACKFILL_LIMIT,
  registerSearchIndexRoutes,
} from "../search-index-routes.js";

// Minimal mock so the Supabase session-token fallback in `resolveRouteAuth`
// can resolve a known "tenant admin" without hitting a live database.
vi.mock("../../../dal/core-users.js", () => ({
  createCoreUsersDal: () => ({
    isAuthUserAdmin: async (token: string) => token === "tenant-admin-token",
    isAuthUserSuperAdmin: async () => false,
    resolveAuthUser: async (token: string) => {
      if (token === "tenant-admin-token") {
        return { id: "user-tenant-admin" };
      }
      throw new Error("invalid session");
    },
    getTenantIdForAuthUser: async (token: string) =>
      token === "tenant-admin-token" ? "tenant-1" : null,
  }),
}));

const SECRET = "test-secret";

async function signToken(opts: {
  capabilities?: string[];
  tenantId?: string;
  userId?: string;
}) {
  return new SignJWT({
    capabilities: opts.capabilities ?? [],
    role: "user",
    tenant_id: opts.tenantId ?? "tenant-1",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(opts.userId ?? "user-1")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(SECRET));
}

interface ProviderStub extends SearchIndexProvider {
  backfill?: NonNullable<SearchIndexProvider["backfill"]>;
  getStatus?: NonNullable<SearchIndexProvider["getStatus"]>;
}

function makeProvider(
  id: string,
  overrides: Partial<ProviderStub> = {}
): ProviderStub {
  return {
    capabilities: { hybrid: true, lexical: true, semantic: true },
    deleteDocument: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockResolvedValue({
      current_count: 5,
      indexed_count: 5,
      last_indexed_at: "2026-05-25T00:00:00.000Z",
      missing_count: 0,
      stale_count: 0,
      total_count: 5,
    }),
    backfill: vi.fn().mockResolvedValue({ replaced: 5, cursor: null }),
    id,
    replaceDocument: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue({ results: [], total: 0 }),
    version: "1",
    ...overrides,
  };
}

function setupApp(registry: SearchIndexRegistry) {
  const app = new OpenAPIHono();
  registerSearchIndexRoutes({
    app,
    config: { securityJwtSecret: SECRET },
    resolveRegistry: () => registry,
  });
  return app;
}

describe("search-index admin routes — provider list", () => {
  let registry: SearchIndexRegistry;

  beforeEach(() => {
    registry = createSearchIndexRegistry();
    registry.register(makeProvider("contacts.contact"), {
      entityName: "contact",
      isSystem: false,
      moduleId: "contacts",
      operationId: "contacts_contact_search",
    });
    registry.register(makeProvider("core_api_catalog"), {
      entityName: "operation",
      isSystem: true,
      moduleId: "core",
    });
  });

  it("lists tenant-scoped providers for tenant admins, hides system providers", async () => {
    const app = setupApp(registry);
    const token = "tenant-admin-token";
    const response = await app.request("/api/search-index/providers", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { providers: Array<{ id: string; is_system: boolean }> };
    };
    expect(body.data.providers.map((p) => p.id)).toEqual(["contacts.contact"]);
  });

  it("lists every provider for superadmin", async () => {
    const app = setupApp(registry);
    const token = await signToken({ capabilities: ["core.superadmin"] });
    const response = await app.request("/api/search-index/providers", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: {
        providers: Array<{
          id: string;
          is_system: boolean;
          supports: { backfill: boolean; search: boolean; status: boolean };
        }>;
      };
    };
    expect(body.data.providers.map((p) => p.id).sort()).toEqual([
      "contacts.contact",
      "core_api_catalog",
    ]);
    expect(
      body.data.providers.find((p) => p.id === "contacts.contact")?.supports
    ).toEqual({ backfill: true, search: true, status: true });
  });

  it("rejects unauthenticated callers", async () => {
    const app = setupApp(registry);
    const response = await app.request("/api/search-index/providers");
    expect(response.status).toBe(401);
  });

  it("returns 403 for authenticated non-admin / non-tenant-admin callers", async () => {
    const app = setupApp(registry);
    const token = await signToken({ capabilities: ["module.read"] });
    const response = await app.request("/api/search-index/providers", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(403);
  });
});

describe("search-index admin routes — status proxy", () => {
  it("proxies getStatus for tenant-scoped provider when tenant admin", async () => {
    const registry = createSearchIndexRegistry();
    const provider = makeProvider("contacts.contact");
    registry.register(provider, {
      entityName: "contact",
      isSystem: false,
      moduleId: "contacts",
    });
    const app = setupApp(registry);
    const response = await app.request(
      "/api/search-index/providers/contacts.contact/status",
      { headers: { authorization: "Bearer tenant-admin-token" } }
    );
    expect(response.status).toBe(200);
    expect(provider.getStatus).toHaveBeenCalledWith({
      tenant_id: "tenant-1",
      user_id: "user-tenant-admin",
    });
  });

  it("returns 403 when tenant admin asks for a system provider", async () => {
    const registry = createSearchIndexRegistry();
    registry.register(makeProvider("core_api_catalog"), {
      entityName: "operation",
      isSystem: true,
      moduleId: "core",
    });
    const app = setupApp(registry);
    const response = await app.request(
      "/api/search-index/providers/core_api_catalog/status",
      { headers: { authorization: "Bearer tenant-admin-token" } }
    );
    expect(response.status).toBe(403);
  });

  it("returns 404 when provider not found", async () => {
    const registry = createSearchIndexRegistry();
    const app = setupApp(registry);
    const token = await signToken({ capabilities: ["core.superadmin"] });
    const response = await app.request(
      "/api/search-index/providers/missing.search/status",
      { headers: { authorization: `Bearer ${token}` } }
    );
    expect(response.status).toBe(404);
  });

  it("returns 501 when provider does not implement getStatus", async () => {
    const registry = createSearchIndexRegistry();
    const provider = makeProvider("contacts.contact");
    (provider as Partial<ProviderStub>).getStatus = undefined;
    registry.register(provider, {
      entityName: "contact",
      isSystem: false,
      moduleId: "contacts",
    });
    const app = setupApp(registry);
    const token = await signToken({ capabilities: ["core.superadmin"] });
    const response = await app.request(
      "/api/search-index/providers/contacts.contact/status",
      { headers: { authorization: `Bearer ${token}` } }
    );
    expect(response.status).toBe(501);
  });
});

describe("search-index admin routes — backfill proxy", () => {
  it("caps backfill limits at MAX_BACKFILL_LIMIT", async () => {
    const registry = createSearchIndexRegistry();
    const provider = makeProvider("contacts.contact");
    registry.register(provider, {
      entityName: "contact",
      isSystem: false,
      moduleId: "contacts",
    });
    const app = setupApp(registry);
    const response = await app.request(
      "/api/search-index/providers/contacts.contact/backfill",
      {
        method: "POST",
        headers: {
          authorization: "Bearer tenant-admin-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ limit: 100_000 }),
      }
    );
    expect(response.status).toBe(422);
  });

  it("forwards capped limit and tenant scope", async () => {
    const registry = createSearchIndexRegistry();
    const provider = makeProvider("contacts.contact");
    registry.register(provider, {
      entityName: "contact",
      isSystem: false,
      moduleId: "contacts",
    });
    const app = setupApp(registry);
    const response = await app.request(
      "/api/search-index/providers/contacts.contact/backfill",
      {
        method: "POST",
        headers: {
          authorization: "Bearer tenant-admin-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ limit: MAX_BACKFILL_LIMIT - 50 }),
      }
    );
    expect(response.status).toBe(200);
    expect(provider.backfill).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: MAX_BACKFILL_LIMIT - 50,
        tenant_id: "tenant-1",
      })
    );
  });

  it("rejects cross-tenant backfill from tenant admin", async () => {
    const registry = createSearchIndexRegistry();
    registry.register(makeProvider("contacts.contact"), {
      entityName: "contact",
      isSystem: false,
      moduleId: "contacts",
    });
    const app = setupApp(registry);
    // The mocked tenant-admin-token resolves to tenantId=tenant-1; targeting
    // tenant-2 in the body must be rejected because the caller is not a
    // superadmin.
    const response = await app.request(
      "/api/search-index/providers/contacts.contact/backfill",
      {
        method: "POST",
        headers: {
          authorization: "Bearer tenant-admin-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ tenant_id: "tenant-2" }),
      }
    );
    expect(response.status).toBe(403);
  });

  it("allows superadmin to target any tenant", async () => {
    const registry = createSearchIndexRegistry();
    const provider = makeProvider("contacts.contact");
    registry.register(provider, {
      entityName: "contact",
      isSystem: false,
      moduleId: "contacts",
    });
    const app = setupApp(registry);
    const token = await signToken({ capabilities: ["core.superadmin"] });
    const response = await app.request(
      "/api/search-index/providers/contacts.contact/backfill",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ tenant_id: "tenant-2", limit: 50 }),
      }
    );
    expect(response.status).toBe(200);
    expect(provider.backfill).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: "tenant-2", limit: 50 })
    );
  });
});

describe("search-index admin routes — search proxy", () => {
  it("forwards caller tenant scope into filters and returns matches/total", async () => {
    const registry = createSearchIndexRegistry();
    const provider = makeProvider("contacts.contact", {
      search: vi.fn().mockResolvedValue({
        results: [{ doc_id: "contact-1", item: { id: "contact-1" } }],
        total: 1,
      }),
    });
    registry.register(provider, {
      entityName: "contact",
      isSystem: false,
      moduleId: "contacts",
    });
    const app = setupApp(registry);
    const response = await app.request(
      "/api/search-index/providers/contacts.contact/search",
      {
        method: "POST",
        headers: {
          authorization: "Bearer tenant-admin-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          // The body's tenant_id is ignored — caller scope wins.
          filters: { module_id: "contacts", tenant_id: "evil-tenant" },
          limit: 10,
          query: "ada",
        }),
      }
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { matches: Array<{ doc_id: string }>; total: number };
    };
    expect(body.data.total).toBe(1);
    expect(body.data.matches).toEqual([
      { doc_id: "contact-1", item: { id: "contact-1" } },
    ]);
    expect(provider.search).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: {
          module_id: "contacts",
          tenant_id: "tenant-1",
          user_id: "user-tenant-admin",
        },
        limit: 10,
        query: "ada",
        strategy: "hybrid",
      })
    );
  });
});
