import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listPublishedWorkflowsRunningAgent } from "../ai/workflows/graph-agents.js";
import { registerRegistryRoutes } from "../api/registry-routes.js";
import { notifyAgentProposed } from "../notifications/agent-proposals.js";

vi.mock("../ai/workflows/graph-agents.js", () => ({
  listPublishedWorkflowsRunningAgent: vi.fn(async () => []),
}));

vi.mock("../notifications/agent-proposals.js", () => ({
  notifyAgentProposed: vi.fn(async () => undefined),
  resolveAgentProposalNotifications: vi.fn(async () => undefined),
}));

const notifyProposed = vi.mocked(notifyAgentProposed);
const referencingWorkflows = vi.mocked(listPublishedWorkflowsRunningAgent);

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
    referencingWorkflows.mockResolvedValue([]);
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

  it("refuses to delete an agent other workflows still run, unless forced", async () => {
    referencingWorkflows.mockResolvedValue([
      { id: "w-9", name: "Weekly report" },
    ]);
    const app = new Hono();
    const mockStore = {
      deleteAgent: vi.fn().mockResolvedValue(true),
    };
    registerRegistryRoutes(app, {
      getStore: () => mockStore as any,
      scopeResolver: createScopeResolver(),
    });

    const refused = await app.request("/ai/registry/agents/agent-2", {
      method: "DELETE",
    });
    expect(refused.status).toBe(409);
    await expect(refused.json()).resolves.toMatchObject({
      error: "agent_registry.referencedByWorkflows",
      workflows: [{ id: "w-9", name: "Weekly report" }],
    });
    expect(mockStore.deleteAgent).not.toHaveBeenCalled();

    const forced = await app.request("/ai/registry/agents/agent-2?force=true", {
      method: "DELETE",
    });
    expect(forced.status).toBe(200);
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
    expect((await res.json()).mounted).toEqual([
      { ok: true, spaceId: "00000000-0000-4000-8000-000000000010" },
    ]);
    expect(putSpaceMount).toHaveBeenCalledTimes(1);
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

  it("refuses to approve a new proposal with no space", async () => {
    const approveAgent = vi.fn();
    const app = new Hono();
    registerRegistryRoutes(app, {
      getStore: () =>
        ({
          getAgentRecord: vi.fn().mockResolvedValue({
            config: { id: "sales.researcher" },
            proposed_space_id: null,
            status: "proposed",
          }),
          approveAgent,
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
    expect(approveAgent).not.toHaveBeenCalled();
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
    expect(notifyProposed).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "sales.researcher",
        spaceId: "00000000-0000-4000-8000-000000000010",
        tenantId: "tenant-1",
      })
    );
  });

  it("refuses a proposal naming tool ids the registry cannot provide", async () => {
    // Approving writes the row the assembler reads; an unresolvable id makes
    // every later message fail with agent_threads.unknownTool.
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
});
