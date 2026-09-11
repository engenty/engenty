import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetStudioTenantStateForTests } from "../ai/studio-tenant-agents.js";
import { MASTRA_STUDIO_API_ENV } from "../config/mastra-studio-api.js";
import { MASTRA_STUDIO_TENANT_ENV } from "../config/mastra-studio-tenant.js";
import { registerStudioTenantRoutes } from "./studio-tenant-routes.js";

const TENANT_A = "00000000-0000-4000-8000-00000000000a";
const TENANT_B = "00000000-0000-4000-8000-00000000000b";
const USER = "00000000-0000-4000-8000-00000000000c";

function scopeResolver(tenantId: string) {
  return async () => ({
    ok: true as const,
    scope: {
      tenantId,
      userId: USER,
      capabilities: ["*"],
      isSuperAdmin: true,
      isTenantAdmin: true,
      tenantRole: "admin" as const,
      credential: { kind: "user" as const, token: "tok" },
    },
  });
}

function unauthorizedResolver() {
  return async () => ({
    ok: false as const,
    error: "agent_threads.unauthorized",
    status: 401 as const,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  resetStudioTenantStateForTests();
});

describe("studio-tenant-routes", () => {
  it("returns 404 when Studio is off", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(MASTRA_STUDIO_API_ENV, "");
    const app = new Hono();
    registerStudioTenantRoutes(app, {
      mastra: { addAgent: vi.fn(), removeAgent: vi.fn() } as never,
      scopeResolver: scopeResolver(TENANT_A),
      createRegistry: () =>
        ({
          getAgentConfig: vi.fn(),
          getTool: vi.fn(),
          listAgentConfigs: async () => [],
        }) as never,
    });
    const res = await app.request("/ai/studio/status", {
      headers: { authorization: "Bearer tok" },
    });
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "studio.disabled" });
  });

  it("returns 401 without a token when Studio is on", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(MASTRA_STUDIO_API_ENV, "1");
    const app = new Hono();
    registerStudioTenantRoutes(app, {
      mastra: { addAgent: vi.fn(), removeAgent: vi.fn() } as never,
      scopeResolver: unauthorizedResolver(),
      createRegistry: () =>
        ({ getAgentConfig: vi.fn(), getTool: vi.fn() }) as never,
    });
    const res = await app.request("/ai/studio/activate", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("returns 409 when env pin differs from the JWT tenant", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(MASTRA_STUDIO_API_ENV, "1");
    vi.stubEnv(MASTRA_STUDIO_TENANT_ENV, TENANT_A);
    const app = new Hono();
    registerStudioTenantRoutes(app, {
      mastra: { addAgent: vi.fn(), removeAgent: vi.fn() } as never,
      scopeResolver: scopeResolver(TENANT_B),
      createRegistry: () =>
        ({
          getAgentConfig: vi.fn(),
          getTool: vi.fn(),
          listAgentConfigs: async () => [],
        }) as never,
    });
    const res = await app.request("/ai/studio/activate", {
      method: "POST",
      headers: { authorization: "Bearer tok" },
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("studio.tenantEnvMismatch");
  });

  it("activates the JWT tenant when env is unset", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(MASTRA_STUDIO_API_ENV, "1");
    const addAgent = vi.fn();
    const app = new Hono();
    registerStudioTenantRoutes(app, {
      assembleAgent: async () => ({ id: "mail-collector" }) as never,
      mastra: { addAgent, removeAgent: vi.fn(() => true) } as never,
      scopeResolver: scopeResolver(TENANT_A),
      createRegistry: () =>
        ({
          getAgentConfig: vi.fn(),
          getTool: vi.fn(),
          listAgentConfigs: async () => [
            { id: "mail-collector", name: "Mail" },
          ],
        }) as never,
    });
    const res = await app.request("/ai/studio/activate", {
      method: "POST",
      headers: { authorization: "Bearer tok" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tenantId: string;
      agentIds: string[];
    };
    expect(body.tenantId).toBe(TENANT_A);
    expect(body.agentIds).toEqual(["mail-collector"]);
    expect(addAgent).toHaveBeenCalled();
  });
});
