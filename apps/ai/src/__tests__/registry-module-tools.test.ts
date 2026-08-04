import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { listModuleTools } from "../api/registry-module-tools.js";
import { registerRegistryRoutes } from "../api/registry-routes.js";

function createScopeResolver() {
  return async () => ({
    ok: true as const,
    scope: {
      tenantId: "tenant-1",
      userId: "user-1",
      isSuperAdmin: true,
      isTenantAdmin: true,
      tenantRole: "admin" as const,
      credential: { kind: "user" as const, token: "token" },
    },
  });
}

const moduleLoader = {
  listModuleCapabilities: vi.fn(async () => [
    {
      moduleId: "contacts",
      tools: {
        contacts_find: { description: "Find contacts" },
        contacts_create: {},
      },
    },
    { moduleId: "tasks" },
  ]),
};

describe("listModuleTools", () => {
  it("flattens capability tools into sorted catalog entries", async () => {
    await expect(listModuleTools(moduleLoader)).resolves.toEqual([
      { id: "contacts_create", name: "contacts_create", source: "contacts" },
      {
        description: "Find contacts",
        id: "contacts_find",
        name: "contacts_find",
        source: "contacts",
      },
    ]);
  });

  it("returns [] without a loader", async () => {
    await expect(listModuleTools(undefined)).resolves.toEqual([]);
  });

  it("returns [] and logs when the capability channel fails", async () => {
    const log = vi.fn();
    const failing = {
      listModuleCapabilities: vi.fn(async () => {
        throw new Error("core unavailable");
      }),
    };
    await expect(listModuleTools(failing, log)).resolves.toEqual([]);
    expect(log).toHaveBeenCalledOnce();
  });
});

describe("GET /ai/registry/tools", () => {
  it("merges database tools with module tools", async () => {
    const app = new Hono();
    const mockStore = {
      listTools: vi.fn(async () => [
        { id: "custom-tool", name: "Custom tool", endpointUrl: "https://x" },
      ]),
    };
    registerRegistryRoutes(app, {
      getStore: () => mockStore as any,
      moduleLoader,
      scopeResolver: createScopeResolver(),
    });

    const res = await app.request("/ai/registry/tools");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tools.map((t: any) => [t.id, t.source ?? null])).toEqual([
      ["custom-tool", null],
      ["contacts_create", "contacts"],
      ["contacts_find", "contacts"],
    ]);
  });

  it("falls back to database tools when the module channel errors", async () => {
    const app = new Hono();
    const mockStore = { listTools: vi.fn(async () => [{ id: "db-tool" }]) };
    registerRegistryRoutes(app, {
      getStore: () => mockStore as any,
      moduleLoader: {
        listModuleCapabilities: vi.fn(async () => {
          throw new Error("boom");
        }),
      },
      scopeResolver: createScopeResolver(),
    });

    const res = await app.request("/ai/registry/tools");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ tools: [{ id: "db-tool" }] });
  });
});
