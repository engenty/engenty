import { describe, expect, it, vi } from "vitest";

const mockAgentInstances = vi.hoisted(() => [] as MockAgentInstance[]);

interface MockAgentInstance {
  config: {
    backgroundTasks?: unknown;
    description?: string;
    id?: string;
    instructions?: string;
    mastra?: unknown;
    memory?: unknown;
    model?: unknown;
    name?: string;
    tools?: Record<string, unknown>;
  };
  generate: ReturnType<typeof vi.fn>;
  getDescription: ReturnType<typeof vi.fn>;
  getInstructions: ReturnType<typeof vi.fn>;
  getMastraInstance: ReturnType<typeof vi.fn>;
  getMemory: ReturnType<typeof vi.fn>;
  hasOwnMemory: ReturnType<typeof vi.fn>;
  id?: string;
  listTools: ReturnType<typeof vi.fn>;
  model?: unknown;
  name?: string;
  streamUntilIdle: ReturnType<typeof vi.fn>;
}

vi.mock("@mastra/core/agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mastra/core/agent")>();
  return {
    ...actual,
    Agent: class MockAgent {
      readonly config: MockAgentInstance["config"];
      readonly generate: MockAgentInstance["generate"];
      readonly getDescription: MockAgentInstance["getDescription"];
      readonly getInstructions: MockAgentInstance["getInstructions"];
      readonly getMastraInstance: MockAgentInstance["getMastraInstance"];
      readonly getMemory: MockAgentInstance["getMemory"];
      readonly hasOwnMemory: MockAgentInstance["hasOwnMemory"];
      readonly id?: string;
      readonly listTools: MockAgentInstance["listTools"];
      readonly model?: unknown;
      readonly name?: string;
      readonly streamUntilIdle: MockAgentInstance["streamUntilIdle"];

      constructor(config: MockAgentInstance["config"]) {
        this.config = config;
        this.id = config.id;
        this.model = config.model;
        this.name = config.name;
        this.generate = vi.fn(async () => ({ text: "ok" }));
        this.getDescription = vi.fn(() => config.description);
        this.getInstructions = vi.fn(async () => config.instructions ?? "");
        this.getMastraInstance = vi.fn(() => undefined);
        this.getMemory = vi.fn(() => config.memory);
        this.hasOwnMemory = vi.fn(() => config.memory != null);
        this.listTools = vi.fn(async () => config.tools ?? {});
        this.streamUntilIdle = vi.fn(async () => ({
          fullStream: new ReadableStream({
            start(controller) {
              controller.close();
            },
          }),
          messageId: "assistant-message-1",
        }));
        mockAgentInstances.push(this);
      }
    },
  };
});

import { createDefaultAiRegistry } from "../ai/agents.js";
import { assembleDynamicAgent } from "../ai/registry/assemble-dynamic-agent.js";
import { createBuiltinProvider } from "../ai/registry/builtin-provider.js";
import { CompositeAiRegistry } from "../ai/registry/composite-ai-registry.js";
import {
  DatabaseProvider,
  type DynamicAiDatabaseStore,
} from "../ai/registry/database-provider.js";
import { createNonExecutableDatabaseTool } from "../ai/registry/database-tool.js";
import { ModuleProvider } from "../ai/registry/module-provider.js";
import type {
  AgentConfig,
  AiRegistryProvider,
  MastraToolDefinition,
} from "../ai/registry/types.js";
import { bindTestModelsPerTest } from "./helpers/test-model-bindings.js";

const tenantId = "00000000-0000-4000-8000-000000000001";

function provider(
  overrides: Partial<AiRegistryProvider> = {}
): AiRegistryProvider {
  return {
    providerId: "test",
    getAgentConfig: vi.fn(async () => undefined),
    getTool: vi.fn(async () => undefined),
    ...overrides,
  };
}

bindTestModelsPerTest();

describe("dynamic AI registry", () => {
  it("lists database, module, and built-in agent configs for the registry API", async () => {
    const loader = {
      listModuleCapabilities: vi.fn(async () => [
        {
          agentConfigs: [
            {
              id: "contacts.manager",
              instructions: "Manage contacts.",
              model: "openai/module",
              name: "Contacts Manager",
              skillIds: [],
              toolIds: [],
            },
          ],
          moduleId: "contacts",
        },
      ]),
    };
    const store = {
      getAgentConfig: vi.fn(async () => undefined),
      getTool: vi.fn(async () => undefined),
      listAgents: vi.fn(async () => [
        {
          id: "tenant_agent",
          instructions: "Tenant instructions.",
          model: "openai/db",
          name: "Tenant Agent",
          skillIds: [],
          toolIds: [],
        },
      ]),
    } satisfies DynamicAiDatabaseStore;
    const registry = new CompositeAiRegistry([
      new DatabaseProvider(store, { tenantId }),
      new ModuleProvider(loader),
      createBuiltinProvider(),
    ]);

    await expect(registry.listAgentConfigs()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "tenant_agent", source: "database" }),
        expect.objectContaining({ id: "contacts.manager", source: "module" }),
        expect.objectContaining({ id: "engenty.copilot", source: "builtin" }),
      ])
    );
  });

  it("scopes database provider lookups to the current tenant", async () => {
    const config: AgentConfig = {
      id: "db_agent",
      instructions: "Tenant instructions.",
      model: "openai/db",
      name: "Tenant Agent",
      skillIds: [],
      toolIds: [],
    };
    const store = {
      getAgentConfig: vi.fn(async () => config),
      getTool: vi.fn(async () => ({ id: "db-tool" })),
    } satisfies DynamicAiDatabaseStore;
    const registry = new DatabaseProvider(store, { tenantId });

    await registry.getAgentConfig("db_agent");
    await registry.getTool("db-tool");

    expect(store.getAgentConfig).toHaveBeenCalledWith(tenantId, "db_agent");
    expect(store.getTool).toHaveBeenCalledWith(tenantId, "db-tool");
  });

  it("refuses to call the persisted endpoint of a database-backed tool", async () => {
    // A registry row carries a URL but no execution policy; calling it would
    // let tenant data steer outbound requests.
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const dbTool = createNonExecutableDatabaseTool({
      endpointUrl: "https://tools.example.test/search",
      id: "db-search",
      name: "DB Search",
      schemaJson: { type: "object" },
    }) as unknown as {
      execute: (input: Record<string, unknown>) => Promise<unknown>;
    };

    await expect(dbTool.execute({ query: "contacts" })).resolves.toMatchObject({
      code: "dynamic_tool_not_executable",
      ok: false,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("applies tenant model config to sub-agents", async () => {
    const configs: Record<string, AgentConfig> = {
      specialist: {
        effort: "high",
        id: "specialist",
        instructions: "Handle specialist work.",
        model: "openai/static-specialist",
        name: "Specialist",
        skillIds: [],
        toolIds: [],
      },
      supervisor: {
        id: "supervisor",
        instructions: "Route to specialists.",
        model: "openai/static-supervisor",
        name: "Supervisor",
        skillIds: [],
        subAgents: [{ id: "specialist" }],
        toolIds: [],
      },
    };
    const registry = provider({
      getAgentConfig: vi.fn(async (id) => configs[id]),
    });

    const agent = (await assembleDynamicAgent(registry, "supervisor", {
      modelConfig: {
        chatModelId: "openai/tenant-chat",
        gradedModelIds: { high: "openai/tenant-high" },
      },
    })) as unknown as {
      config: { agents: Record<string, { config: { model: string } }> };
    };

    expect(agent.config.agents.specialist.config.model).toMatchObject({
      modelId: "openai/tenant-high",
    });
  });

  it("opts agents out of background tool calls unless their config asks for them", async () => {
    // Otherwise Mastra splices a background override into every tool schema.
    const registry = provider({
      getAgentConfig: vi.fn(async () => ({
        id: "agent",
        instructions: "Work.",
        model: "openai/test",
        name: "Agent",
        skillIds: [],
        toolIds: [],
      })),
    });

    const agent = (await assembleDynamicAgent(
      registry,
      "agent"
    )) as unknown as {
      config: { backgroundTasks: unknown };
    };

    expect(agent.config.backgroundTasks).toEqual({ disabled: true });
  });

  it("withholds skill-gated tools through an input processor", async () => {
    const laneTool = { id: "lane_tool" } satisfies MastraToolDefinition;
    const registry = provider({
      getAgentConfig: vi.fn(async () => ({
        id: "agent",
        instructions: "Work.",
        model: "openai/test",
        name: "Agent",
        skillIds: ["lane-skill"],
        toolGating: { bySkill: { "lane-skill": ["lane_tool"] } },
        toolIds: ["lane_tool"],
      })),
      getTool: vi.fn(async (id) => (id === "lane_tool" ? laneTool : undefined)),
    });

    const agent = (await assembleDynamicAgent(
      registry,
      "agent"
    )) as unknown as {
      config: { inputProcessors?: { id: string }[] };
    };

    expect(
      agent.config.inputProcessors?.map((processor) => processor.id)
    ).toContain("skill-gated-tools");
  });

  it("assembles a module agent with its module tools and shared built-in tools", async () => {
    const moduleTool = { id: "kb_search" } as MastraToolDefinition;
    const loader = {
      listModuleCapabilities: vi.fn(async () => [
        {
          agentConfigs: [
            {
              id: "knowledge-base.manager",
              instructions: "Use Knowledge Base tools.",
              model: "openai/module",
              name: "Knowledge Base Manager",
              skillIds: [],
              toolIds: ["kb_search", "web_search"],
            },
          ],
          moduleId: "knowledge-base",
          tools: { kb_search: moduleTool },
        },
      ]),
    };

    const agent = (await assembleDynamicAgent(
      createDefaultAiRegistry({ moduleLoader: loader, tenantId }),
      "knowledge-base.manager"
    )) as unknown as {
      config: { tools: Record<string, MastraToolDefinition> };
    };

    expect(agent.config.tools).toHaveProperty("kb_search");
    expect(agent.config.tools).toHaveProperty("web_search");
  });

  it("throws a harness error for missing agent configs", async () => {
    await expect(
      assembleDynamicAgent(provider(), "missing-agent")
    ).rejects.toMatchObject({
      code: "agent_threads.unknownAgentType",
      details: { agent_id: "missing-agent" },
    });
  });

  it("throws unknownTool (not unknownAgentType) when a declared tool is unresolvable", async () => {
    await expect(
      assembleDynamicAgent(
        provider({
          getAgentConfig: vi.fn(async (id: string) =>
            id === "agent-with-missing-tool"
              ? {
                  id: "agent-with-missing-tool",
                  instructions: "Work.",
                  model: "openai/test",
                  name: "Tool Agent",
                  skillIds: [],
                  toolIds: ["nonexistent-tool"],
                }
              : undefined
          ),
        }),
        "agent-with-missing-tool"
      )
    ).rejects.toMatchObject({
      code: "agent_threads.unknownTool",
      details: { missing_tool_id: "nonexistent-tool" },
    });
  });
});
