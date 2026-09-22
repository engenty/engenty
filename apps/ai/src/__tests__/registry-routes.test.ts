import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerRegistryRoutes } from "../api/registry-routes.js";
import {
  notifyAgentProposed,
  resolveAgentProposalNotifications,
} from "../notifications/agent-proposals.js";

vi.mock("../notifications/agent-proposals.js", () => ({
  notifyAgentProposed: vi.fn(async () => undefined),
  resolveAgentProposalNotifications: vi.fn(async () => undefined),
}));

const notifyProposed = vi.mocked(notifyAgentProposed);
const resolveProposed = vi.mocked(resolveAgentProposalNotifications);

function createScopeResolver() {
  return async () => ({
    ok: true as const,
    scope: {
      tenantId: "tenant-1",
      userId: "user-1",
      capabilities: ["core.superadmin", "*"],
      isSuperAdmin: true,
      isTenantAdmin: true,
      tenantRole: "admin" as const,
      credential: { kind: "user" as const, token: "token" },
    },
  });
}

describe("registry-routes", () => {
  beforeEach(() => {
    notifyProposed.mockClear();
    resolveProposed.mockClear();
  });

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
      {
        id: "engenty.copilot",
        interfaceRole: "live",
        kind: "interface",
        name: "Engenty Copilot",
        source: "builtin",
      },
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
          // `can_execute` is false for both: neither declared a sandbox. The
          // Space's Compute settings offer a placement only where it is true.
          can_execute: false,
          id: "contacts.manager",
          managed_by_module: null,
          name: "Contacts Manager",
          role: "specialist",
          source: "module",
        },
        {
          can_execute: false,
          id: "engenty.copilot",
          interfaceRole: "live",
          kind: "interface",
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
      getAgentConfig: vi.fn().mockResolvedValue({
        id: "chatbot.faq",
        interfaceRole: "remote",
        kind: "interface",
        moduleId: "chatbot",
        name: "FAQ Bot",
      }),
      listAgents: vi.fn(async () => [
        {
          id: "chatbot.faq",
          interfaceRole: "remote",
          kind: "interface",
          moduleId: "chatbot",
          name: "FAQ Bot",
        },
        {
          id: "knowledge-base.answers",
          kind: "chat_surface",
          name: "KB Answers",
        },
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

  it("refuses a hire into a space that already holds the agent limit", async () => {
    const app = new Hono();
    const putSpaceMount = vi.fn().mockResolvedValue({});
    const listSpaceMounts = vi.fn().mockResolvedValue(
      Array.from({ length: 20 }, (_, index) => ({
        resourceKey: `hire-${index}`,
        resourceType: "agent",
      }))
    );
    const mockStore = {
      upsertAgent: vi.fn(),
    };

    registerRegistryRoutes(app, {
      createCoreClient: () => ({ listSpaceMounts, putSpaceMount }) as any,
      getStore: () => mockStore as any,
      scopeResolver: createScopeResolver(),
    });

    const res = await app.request("/ai/registry/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "agent-21",
        name: "Agent 21",
        model: "gpt-4",
        instructions: "One too many.",
        spaceIds: ["00000000-0000-4000-8000-000000000002"],
      }),
    });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("agent_registry.spaceAgentLimit");
    expect(mockStore.upsertAgent).not.toHaveBeenCalled();
    expect(putSpaceMount).not.toHaveBeenCalled();
  });

  it("should create agent", async () => {
    const app = new Hono();
    const putSpaceMount = vi.fn().mockResolvedValue({});
    const listSpaceMounts = vi.fn().mockResolvedValue([]);
    const mockStore = {
      upsertAgent: vi
        .fn()
        .mockImplementation((_tenantId, agent) => Promise.resolve(agent)),
    };

    registerRegistryRoutes(app, {
      createCoreClient: () => ({ listSpaceMounts, putSpaceMount }) as any,
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
        spaceIds: ["00000000-0000-4000-8000-000000000002"],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agent.id).toBe("agent-2");
    expect(body.mounted).toEqual([
      { ok: true, spaceId: "00000000-0000-4000-8000-000000000002" },
    ]);
    expect(mockStore.upsertAgent).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({ id: "agent-2" })
    );
    expect(putSpaceMount).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000002",
      { resource_key: "agent-2", resource_type: "agent" }
    );
  });

  it("refuses to create an agent with no spaces", async () => {
    const app = new Hono();
    registerRegistryRoutes(app, {
      getStore: () =>
        ({
          upsertAgent: vi.fn(),
        }) as any,
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
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "agent_registry.spaceRequired",
    });
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

  it("approves a new proposal and mounts the stamped space", async () => {
    const putSpaceMount = vi.fn().mockResolvedValue({});
    const app = new Hono();
    const mockStore = {
      getAgentRecord: vi.fn().mockResolvedValue({
        config: { id: "sales.researcher", name: "Sales Researcher" },
        proposed_space_id: "00000000-0000-4000-8000-000000000010",
        status: "proposed",
      }),
      approveAgent: vi.fn().mockResolvedValue({
        id: "sales.researcher",
        name: "Sales Researcher",
      }),
    };
    registerRegistryRoutes(app, {
      createCoreClient: () => ({ putSpaceMount }) as any,
      getStore: () => mockStore as any,
      scopeResolver: createScopeResolver(),
    });

    const res = await app.request(
      "/ai/registry/agents/sales.researcher/approve",
      {
        method: "POST",
      }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agent.id).toBe("sales.researcher");
    expect(body.mounted).toEqual([
      { ok: true, spaceId: "00000000-0000-4000-8000-000000000010" },
    ]);
    expect(putSpaceMount).toHaveBeenCalledTimes(1);
    expect(resolveProposed).toHaveBeenCalledWith({
      agentId: "sales.researcher",
      tenantId: "tenant-1",
    });
  });

  it("does not remount when approving a revision", async () => {
    const putSpaceMount = vi.fn().mockResolvedValue({});
    const app = new Hono();
    registerRegistryRoutes(app, {
      createCoreClient: () => ({ putSpaceMount }) as any,
      getStore: () =>
        ({
          getAgentRecord: vi.fn().mockResolvedValue({
            config: { id: "sales.researcher" },
            proposed_config: { name: "v2" },
            proposed_space_id: "00000000-0000-4000-8000-000000000010",
            status: "active",
          }),
          approveAgent: vi.fn().mockResolvedValue({
            id: "sales.researcher",
            name: "v2",
          }),
        }) as any,
      scopeResolver: createScopeResolver(),
    });

    const res = await app.request(
      "/ai/registry/agents/sales.researcher/approve",
      {
        method: "POST",
      }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).mounted).toEqual([]);
    expect(putSpaceMount).not.toHaveBeenCalled();
  });

  it("approves a new proposal using the body spaceId when none was stamped", async () => {
    const putSpaceMount = vi.fn().mockResolvedValue({});
    const app = new Hono();
    registerRegistryRoutes(app, {
      createCoreClient: () => ({ putSpaceMount }) as any,
      getStore: () =>
        ({
          getAgentRecord: vi.fn().mockResolvedValue({
            config: { id: "sales.researcher" },
            proposed_space_id: null,
            status: "proposed",
          }),
          approveAgent: vi.fn().mockResolvedValue({
            id: "sales.researcher",
            name: "Sales Researcher",
          }),
        }) as any,
      scopeResolver: createScopeResolver(),
    });

    const spaceId = "00000000-0000-4000-8000-000000000010";
    const res = await app.request(
      "/ai/registry/agents/sales.researcher/approve",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId }),
      }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).mounted).toEqual([{ ok: true, spaceId }]);
    expect(putSpaceMount).toHaveBeenCalledTimes(1);
  });

  it("refuses to approve a new proposal with no space", async () => {
    const app = new Hono();
    registerRegistryRoutes(app, {
      getStore: () =>
        ({
          getAgentRecord: vi.fn().mockResolvedValue({
            config: { id: "sales.researcher" },
            proposed_space_id: null,
            status: "proposed",
          }),
          approveAgent: vi.fn(),
        }) as any,
      scopeResolver: createScopeResolver(),
    });

    const res = await app.request(
      "/ai/registry/agents/sales.researcher/approve",
      {
        method: "POST",
      }
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "agent_registry.spaceRequired",
    });
    expect(resolveProposed).not.toHaveBeenCalled();
  });

  it("stamps proposed_space_id on propose and does not mount", async () => {
    const putSpaceMount = vi.fn().mockResolvedValue({});
    const proposeAgent = vi.fn().mockResolvedValue({
      proposed_space_id: "00000000-0000-4000-8000-000000000010",
      status: "proposed",
    });
    const app = new Hono();
    registerRegistryRoutes(app, {
      createCoreClient: () => ({ putSpaceMount }) as any,
      getStore: () => ({ proposeAgent }) as any,
      scopeResolver: createScopeResolver(),
    });

    const res = await app.request(
      "/ai/registry/agents/sales.researcher/propose",
      {
        body: JSON.stringify({
          instructions: "You are a helpful assistant.",
          model: "gpt-4",
          name: "Sales Researcher",
          proposed_space_id: "00000000-0000-4000-8000-000000000010",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }
    );
    expect(res.status).toBe(200);
    expect(proposeAgent).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({ id: "sales.researcher" }),
      {
        proposedByAgent: null,
        proposedSpaceId: "00000000-0000-4000-8000-000000000010",
      }
    );
    expect(putSpaceMount).not.toHaveBeenCalled();
    expect(notifyProposed).toHaveBeenCalledWith({
      agentId: "sales.researcher",
      agentName: "Sales Researcher",
      pendingRevision: false,
      proposedByAgent: null,
      spaceId: "00000000-0000-4000-8000-000000000010",
      tenantId: "tenant-1",
    });
  });

  it("refuses a proposal naming tool ids the registry cannot provide", async () => {
    // A proposal is not a draft: approving it writes the row the assembler
    // reads, and an id nothing can resolve makes every later message fail
    // with agent_threads.unknownTool. The browser tools are the live case —
    // they arrive on a run from the space's browser, never from the registry.
    const proposeAgent = vi.fn();
    const app = new Hono();
    registerRegistryRoutes(app, {
      getRegistry: () =>
        ({
          getAgentConfig: vi.fn(),
          getTool: vi.fn(async (id: string) =>
            id === "web_search" ? { id } : undefined
          ),
          listAgentConfigs: vi.fn(),
        }) as any,
      getStore: () => ({ proposeAgent }) as any,
      scopeResolver: createScopeResolver(),
    });

    const res = await app.request(
      "/ai/registry/agents/shopping.buyer/propose",
      {
        body: JSON.stringify({
          instructions: "You are a helpful assistant.",
          model: "gpt-4",
          name: "Shopping Buyer",
          toolIds: ["web_search", "browser_goto", "browser_click"],
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "agent_registry.unknownTools",
      unknown_tool_ids: ["browser_goto", "browser_click"],
    });
    expect(proposeAgent).not.toHaveBeenCalled();
    expect(notifyProposed).not.toHaveBeenCalled();
  });

  it("resolves the proposal notification on reject", async () => {
    const rejectAgent = vi.fn().mockResolvedValue(true);
    const app = new Hono();
    registerRegistryRoutes(app, {
      getStore: () => ({ rejectAgent }) as any,
      scopeResolver: createScopeResolver(),
    });

    const res = await app.request(
      "/ai/registry/agents/sales.researcher/reject",
      { method: "POST" }
    );
    expect(res.status).toBe(200);
    expect(rejectAgent).toHaveBeenCalledWith("tenant-1", "sales.researcher");
    expect(resolveProposed).toHaveBeenCalledWith({
      agentId: "sales.researcher",
      tenantId: "tenant-1",
    });
  });

  it("patches a builtin agent with no store row by upserting the registry definition", async () => {
    const app = new Hono();
    const builtin = {
      agentScope: "personal" as const,
      id: "engenty.copilot",
      instructions: "You are the copilot.",
      kind: "interface" as const,
      model: "openai/gpt-4.1-mini",
      name: "Engenty Copilot",
      skillIds: ["work-routing"],
      source: "builtin" as const,
      toolIds: ["skill"],
    };
    const upsertAgent = vi
      .fn()
      .mockImplementation((_tenantId: string, agent: unknown) =>
        Promise.resolve(agent)
      );
    registerRegistryRoutes(app, {
      getRegistry: () =>
        ({
          getAgentConfig: vi.fn(async (id: string) =>
            id === "engenty.copilot" ? builtin : undefined
          ),
          getTool: vi.fn(),
        }) as any,
      getStore: () =>
        ({
          getAgentConfig: vi.fn().mockResolvedValue(undefined),
          upsertAgent,
        }) as any,
      scopeResolver: createScopeResolver(),
    });

    const res = await app.request("/ai/registry/agents/engenty.copilot", {
      body: JSON.stringify({ connectorIds: ["google-gmail"] }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      agent: {
        connectorIds: ["google-gmail"],
        id: "engenty.copilot",
        toolIds: ["skill"],
      },
    });
    expect(upsertAgent).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({
        connectorIds: ["google-gmail"],
        id: "engenty.copilot",
        instructions: "You are the copilot.",
        toolIds: ["skill"],
      })
    );
  });

  it("still 404s a PATCH when neither the store nor the registry has the agent", async () => {
    const app = new Hono();
    const upsertAgent = vi.fn();
    registerRegistryRoutes(app, {
      getRegistry: () =>
        ({
          getAgentConfig: vi.fn().mockResolvedValue(undefined),
          getTool: vi.fn(),
        }) as any,
      getStore: () =>
        ({
          getAgentConfig: vi.fn().mockResolvedValue(undefined),
          upsertAgent,
        }) as any,
      scopeResolver: createScopeResolver(),
    });

    const res = await app.request("/ai/registry/agents/missing.agent", {
      body: JSON.stringify({ connectorIds: ["slack"] }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });

    expect(res.status).toBe(404);
    expect(upsertAgent).not.toHaveBeenCalled();
  });
});
