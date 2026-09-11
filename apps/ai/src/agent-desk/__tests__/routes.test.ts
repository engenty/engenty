import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { registerAgentDeskRoutes } from "../routes.js";

describe("agent desk routes", () => {
  it("requires an authorized AI scope before reading the Space", async () => {
    const app = new Hono();
    const getRegistry = vi.fn();
    registerAgentDeskRoutes(app as never, {
      aiService: {} as never,
      getRegistry,
      scopeResolver: async () => ({
        error: "agent_threads.unauthorized",
        ok: false,
        status: 401,
      }),
    });

    const response = await app.request(
      "/ai/v1/agent-desk/feed?space_id=00000000-0000-4000-8000-000000000001&agent_id=custom.researcher"
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "agent_threads.unauthorized",
    });
    expect(getRegistry).not.toHaveBeenCalled();
  });

  it("validates required feed query parameters", async () => {
    const app = new Hono();
    registerAgentDeskRoutes(app as never, {
      aiService: {} as never,
      getRegistry: vi.fn(),
      scopeResolver: async () => ({
        ok: true,
        scope: {
          credential: { kind: "user", token: "token" },
          tenantId: "00000000-0000-4000-8000-000000000003",
          userId: "00000000-0000-4000-8000-000000000002",
        },
      }),
    });

    const response = await app.request("/ai/v1/agent-desk/feed");

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "agent_desk.invalidQuery",
    });
  });

  it("validates required generated-starters query parameters", async () => {
    const app = new Hono();
    registerAgentDeskRoutes(app as never, {
      aiService: {} as never,
      getRegistry: vi.fn(),
      scopeResolver: async () => ({
        ok: true,
        scope: {
          credential: { kind: "user", token: "token" },
          tenantId: "00000000-0000-4000-8000-000000000003",
          userId: "00000000-0000-4000-8000-000000000002",
        },
      }),
    });

    const response = await app.request("/ai/v1/agent-desk/starters");

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "agent_desk.invalidQuery",
    });
  });
});
