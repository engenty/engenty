import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { registerRegistryRoutes } from "../api/registry-routes.js";

function createScopeResolver() {
  return async () => ({
    ok: true as const,
    scope: {
      tenantId: "tenant-1",
      userId: "user-1",
      isSuperAdmin: true,
      isTenantAdmin: true,
      tenantRole: "admin",
      userAccessToken: "token",
    },
  });
}

describe("registry-routes", () => {
  it("should list agents", async () => {
    const app = new Hono();
    const mockStore = {
      listAgents: vi
        .fn()
        .mockResolvedValue([{ id: "agent-1", name: "Agent 1" }]),
    };

    registerRegistryRoutes(app, {
      getStore: () => mockStore as any,
      scopeResolver: createScopeResolver(),
    });

    const res = await app.request("/ai/registry/agents");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agents).toHaveLength(1);
    expect(body.agents[0].id).toBe("agent-1");
  });

  it("lists module and built-in agents through the composite registry", async () => {
    const app = new Hono();
    const listAgentConfigs = vi.fn(async () => [
      {
        id: "contacts.manager",
        name: "Contacts Manager",
        source: "module",
      },
      { id: "engenty.copilot", name: "Engenty Copilot", source: "builtin" },
    ]);
    const mockStore = {
      listAgents: vi.fn(async () => [{ id: "db-only", name: "DB Only" }]),
    };

    registerRegistryRoutes(app, {
      getRegistry: () =>
        ({
          getAgentConfig: vi.fn(),
          getTool: vi.fn(),
          listAgentConfigs,
        }) as any,
      getStore: () => mockStore as any,
      scopeResolver: createScopeResolver(),
    });

    const res = await app.request("/ai/registry/agents");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      agents: [
        {
          id: "contacts.manager",
          managed_by_module: null,
          name: "Contacts Manager",
          role: "specialist",
          source: "module",
        },
        {
          id: "engenty.copilot",
          managed_by_module: null,
          name: "Engenty Copilot",
          role: "copilot",
          source: "builtin",
        },
      ],
    });
    expect(listAgentConfigs).toHaveBeenCalledTimes(1);
    expect(mockStore.listAgents).not.toHaveBeenCalled();
  });

  it("decorates agents with role and managed_by_module", async () => {
    const app = new Hono();
    const mockStore = {
      getAgentConfig: vi
        .fn()
        .mockResolvedValue({ id: "chatbot.faq", name: "FAQ Bot" }),
      listAgents: vi.fn(async () => [
        { id: "chatbot.faq", name: "FAQ Bot" },
        { id: "knowledge-base.answers", name: "KB Answers" },
        { id: "custom-helper", name: "Custom Helper" },
      ]),
    };

    registerRegistryRoutes(app, {
      getStore: () => mockStore as any,
      scopeResolver: createScopeResolver(),
    });

    const res = await app.request("/ai/registry/agents");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(
      body.agents.map((a: any) => [a.id, a.role, a.managed_by_module])
    ).toEqual([
      ["chatbot.faq", "external", "chatbot"],
      ["knowledge-base.answers", "chat_surface", null],
      ["custom-helper", "specialist", null],
    ]);

    const detail = await app.request("/ai/registry/agents/chatbot.faq");
    expect(detail.status).toBe(200);
    const detailBody = await detail.json();
    expect(detailBody.agent.role).toBe("external");
    expect(detailBody.agent.managed_by_module).toBe("chatbot");
  });

  it("should create agent", async () => {
    const app = new Hono();
    const mockStore = {
      upsertAgent: vi
        .fn()
        .mockImplementation((tenantId, agent) => Promise.resolve(agent)),
    };

    registerRegistryRoutes(app, {
      getStore: () => mockStore as any,
      scopeResolver: createScopeResolver(),
    });

    const res = await app.request("/ai/registry/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "agent-2",
        name: "Agent 2",
        model: "gpt-4",
        instructions: "You are a helpful assistant.",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agent.id).toBe("agent-2");
    expect(mockStore.upsertAgent).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({ id: "agent-2" })
    );
  });

  it("should delete agent in the resolved tenant scope", async () => {
    const app = new Hono();
    const mockStore = {
      deleteAgent: vi.fn().mockResolvedValue(true),
    };

    registerRegistryRoutes(app, {
      getStore: () => mockStore as any,
      scopeResolver: createScopeResolver(),
    });

    const res = await app.request("/ai/registry/agents/agent-2", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ deleted: true });
    expect(mockStore.deleteAgent).toHaveBeenCalledWith("tenant-1", "agent-2");
  });

  it("should update a tool without allowing route id changes", async () => {
    const app = new Hono();
    const existing = {
      endpointUrl: "https://tools.example.test/search",
      id: "search-tool",
      name: "Search tool",
      schemaJson: { type: "object" },
    };
    const mockStore = {
      getToolConfig: vi.fn().mockResolvedValue(existing),
      upsertTool: vi
        .fn()
        .mockImplementation((_tenantId, tool) => Promise.resolve(tool)),
    };

    registerRegistryRoutes(app, {
      getStore: () => mockStore as any,
      scopeResolver: createScopeResolver(),
    });

    const res = await app.request("/ai/registry/tools/search-tool", {
      body: JSON.stringify({
        id: "renamed-tool",
        schemaJson: { properties: { query: { type: "string" } } },
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      tool: {
        endpointUrl: "https://tools.example.test/search",
        id: "search-tool",
        name: "Search tool",
        schemaJson: { properties: { query: { type: "string" } } },
      },
    });
    expect(mockStore.upsertTool).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({ id: "search-tool" })
    );
  });

  it("should delete a tool in the resolved tenant scope", async () => {
    const app = new Hono();
    const mockStore = {
      deleteTool: vi.fn().mockResolvedValue(true),
    };

    registerRegistryRoutes(app, {
      getStore: () => mockStore as any,
      scopeResolver: createScopeResolver(),
    });

    const res = await app.request("/ai/registry/tools/search-tool", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ deleted: true });
    expect(mockStore.deleteTool).toHaveBeenCalledWith(
      "tenant-1",
      "search-tool"
    );
  });
});
