import { ENGENTY_DEV_SERVICE_URLS_FIXTURE } from "@engenty/environment";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { MASTRA_STUDIO_API_ENV } from "../config/mastra-studio-api.js";

// createApp() imports the heavy Mastra module graph; allow for a slow CI box.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

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

  // Mastra's native REST routes authenticate nothing; mounted, they would serve
  // tenant data and approve tool calls anonymously.
  describe("mastra native REST API is not mounted by default", () => {
    const nativeRoutes = [
      { method: "GET", path: "/ai/agents" },
      { method: "GET", path: "/ai/agents/engenty.copilot/suspended-runs" },
      { method: "GET", path: "/ai/workflows" },
      { method: "GET", path: "/ai/memory/threads" },
      { method: "GET", path: "/ai/schedules" },
      { method: "GET", path: "/ai/stored/agents" },
      { method: "GET", path: "/ai/workspaces" },
      { method: "GET", path: "/ai/system/api-schema" },
      { method: "POST", path: "/ai/agents/engenty.copilot/approve-tool-call" },
      { method: "POST", path: "/ai/tools/chatThreadSearch/execute" },
    ];

    it.each(
      nativeRoutes
    )("$method $path is unroutable without an Authorization header", async ({
      method,
      path,
    }) => {
      const app = await createApp();
      const res = await app.request(`http://localhost${path}`, {
        method,
        ...(method === "POST"
          ? {
              headers: { "content-type": "application/json" },
              body: "{}",
            }
          : {}),
      });
      // 404, not 400/422: the routes must not exist at all.
      expect(res.status).toBe(404);
    });

    it("stays unmounted in production even when the flag is set", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv(MASTRA_STUDIO_API_ENV, "1");
      const app = await createApp();
      const res = await app.request("http://localhost/ai/agents");
      expect(res.status).toBe(404);
    });
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
