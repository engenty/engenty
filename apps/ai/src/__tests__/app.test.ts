import { ENGENTY_DEV_SERVICE_URLS_FIXTURE } from "@engenty/environment";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStaticAiScopeResolver } from "../api/http.js";
import { createApp } from "../app.js";

// The first createApp() in this fork transforms + imports the heavy Mastra module
// graph (warm ~1.6s, but able to balloon past the runner's 10s default on a loaded
// CI box — this surfaced as "Test timed out in 10000ms" on engenty/engenty#7). Pin a
// generous per-file timeout so it holds regardless of which vitest config runs the
// file (root `pnpm test` uses 10s; apps/ai's own config sets its own).
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const testScopeResolver = createStaticAiScopeResolver({
  tenantId: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
});

describe("@engenty/ai", () => {
  beforeEach(() => {
    vi.stubEnv(
      "ENGENTY_CORS_ORIGINS",
      ENGENTY_DEV_SERVICE_URLS_FIXTURE.corsOrigins
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("GET /ai/health returns ok", async () => {
    const app = await createApp();
    const res = await app.request("http://localhost/ai/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; service: string };
    expect(body.ok).toBe(true);
    expect(body.service).toBe("@engenty/ai");
  });

  it("CORS allows Mastra Studio on an ENGENTY_CORS_ORIGINS localhost port", async () => {
    const mastraStudioOrigin = "http://localhost:43111";
    const app = await createApp();
    const res = await app.request("http://localhost/ai/health", {
      headers: { Origin: mastraStudioOrigin },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      mastraStudioOrigin
    );
  });

  it("CORS preflight OPTIONS for Studio origin", async () => {
    const mastraStudioOrigin = "http://localhost:43111";
    const app = await createApp();
    const res = await app.request("http://localhost/ai/agents", {
      method: "OPTIONS",
      headers: {
        Origin: mastraStudioOrigin,
        "Access-Control-Request-Method": "GET",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      mastraStudioOrigin
    );
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("CORS preflight allows Authorization from engenty.localhost", async () => {
    const app = await createApp();
    const res = await app.request("http://localhost/ai/threads", {
      method: "OPTIONS",
      headers: {
        Origin: "https://engenty.localhost",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "accept,content-type,authorization",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://engenty.localhost"
    );
    const allowHeaders =
      res.headers.get("Access-Control-Allow-Headers")?.toLowerCase() ?? "";
    expect(allowHeaders).toContain("authorization");
    expect(allowHeaders).not.toContain("x-engenty-tenant-id");
    expect(allowHeaders).not.toContain("x-engenty-user-id");
  });

  it("CORS allows Engenty UI on https://engenty.localhost", async () => {
    const app = await createApp();
    const res = await app.request("http://localhost/ai/health", {
      headers: { Origin: "https://engenty.localhost" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://engenty.localhost"
    );
  });

  it("GET /ai/threads returns 401 without Authorization", async () => {
    const app = await createApp();
    const res = await app.request("http://localhost/ai/threads");
    expect(res.status).toBe(401);
  });

  it("DELETE /ai/threads/:id returns 401 without Authorization", async () => {
    const app = await createApp();
    const res = await app.request(
      "http://localhost/ai/threads/00000000-0000-4000-8000-000000000099",
      { method: "DELETE" }
    );
    expect(res.status).toBe(401);
  });

  it("DELETE /ai/threads returns 401 without Authorization", async () => {
    const app = await createApp();
    const res = await app.request("http://localhost/ai/threads", {
      method: "DELETE",
    });
    expect(res.status).toBe(401);
  });

  it("POST /ai/threads returns 503 without database config", async () => {
    const app = await createApp({ scopeResolver: testScopeResolver });
    const res = await app.request("http://localhost/ai/threads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-token",
      },
      body: JSON.stringify({
        agent_id: "engenty.copilot",
        route_context: { pathname: "/mdl/engenty-copilot/chat" },
      }),
    });
    const hasDb = Boolean(
      process.env.SUPABASE_URL?.trim() &&
        process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    );
    if (hasDb) {
      expect([201, 400, 500]).toContain(res.status);
    } else {
      expect(res.status).toBe(503);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toBe("agent_threads.unconfiguredDatabase");
    }
  });

  it("POST /ai/threads returns 401 without Authorization", async () => {
    const app = await createApp();
    const res = await app.request("http://localhost/ai/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id: "engenty.copilot" }),
    });
    expect(res.status).toBe(401);
  });
});
