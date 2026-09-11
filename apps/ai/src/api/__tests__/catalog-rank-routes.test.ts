import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCatalogRankingEmbeddingCache } from "../../dal/api-catalog/catalog-record-ranking.js";
import {
  DEFAULT_CATALOG_RANK_MIN_SCORE,
  registerCatalogRankRoutes,
} from "../catalog-rank-routes.js";
import { createStaticAiScopeResolver } from "../http.js";

const { embedManyMock, embedMock } = vi.hoisted(() => ({
  embedManyMock: vi.fn(),
  embedMock: vi.fn(),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    embed: embedMock,
    embedMany: embedManyMock,
  };
});

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";

function setupApp() {
  const app = new Hono();
  registerCatalogRankRoutes(app as never, {
    scopeResolver: createStaticAiScopeResolver({ tenantId, userId }),
  });
  return app;
}

describe("POST /ai/v1/catalog/rank", () => {
  beforeEach(() => {
    clearCatalogRankingEmbeddingCache();
    embedMock.mockReset();
    embedManyMock.mockReset();
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ranks lexically when embeddings are unavailable", async () => {
    const app = setupApp();
    const response = await app.request("/ai/v1/catalog/rank", {
      body: JSON.stringify({
        entries: [
          {
            description: "Invoice CRUD with PDF export",
            id: "invoices",
            name: "Invoices",
          },
          {
            description: "Project management with phases and tasks",
            id: "projects",
            name: "Projects",
          },
        ],
        query: "project",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ranked: Array<{ id: string }>;
    };
    expect(body.ranked.map((item) => item.id)).toEqual(["projects"]);
  });

  it("surfaces semantic matches that have no lexical overlap", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-gateway-key");
    embedMock.mockResolvedValueOnce({ embedding: [1, 0] });
    embedManyMock.mockResolvedValueOnce({
      embeddings: [
        [0.1, 0.9],
        [1, 0],
      ],
    });
    const app = setupApp();
    const response = await app.request("/ai/v1/catalog/rank", {
      body: JSON.stringify({
        entries: [
          {
            description: "Invoice CRUD with PDF export",
            id: "invoices",
            name: "Invoices",
          },
          {
            description:
              "Tenant-owned applications with a frontend and a backend",
            id: "engenty-apps",
            name: "Apps",
          },
        ],
        min_score: DEFAULT_CATALOG_RANK_MIN_SCORE,
        query: "coding",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ranked: Array<{ id: string; semantic: number }>;
    };
    expect(body.ranked.map((item) => item.id)).toEqual(["engenty-apps"]);
    expect(body.ranked[0]?.semantic).toBeGreaterThan(0.9);
  });

  it("rejects an empty catalog payload", async () => {
    const app = setupApp();
    const response = await app.request("/ai/v1/catalog/rank", {
      body: JSON.stringify({ entries: [], query: "coding" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(response.status).toBe(400);
  });
});
