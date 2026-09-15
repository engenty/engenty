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

import { LIVE_HIRE_TOOL_IDS } from "@engenty/ai-core";
import { builtinFunctionAgents } from "../ai/agents/function-agents.js";
import { createDefaultAiRegistry } from "../ai/agents.js";
import { assembleDynamicAgent } from "../ai/registry/assemble-dynamic-agent.js";
import { createBuiltinProvider } from "../ai/registry/builtin-provider.js";
import { CompositeAiRegistry } from "../ai/registry/composite-ai-registry.js";
import {
  DatabaseProvider,
  type DynamicAiDatabaseStore,
} from "../ai/registry/database-provider.js";
import { createNonExecutableDatabaseTool } from "../ai/registry/database-tool.js";
import { FunctionAgentProvider } from "../ai/registry/function-provider.js";
import { ModuleProvider } from "../ai/registry/module-provider.js";
import type {
  AgentConfig,
  AiRegistryProvider,
  MastraToolDefinition,
} from "../ai/registry/types.js";
import { createThreadService } from "../ai/sessions.js";
import type {
  ThreadMessageRow,
  ThreadRow,
  ThreadStore,
} from "../dal/threads/index.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const threadId = "00000000-0000-4000-8000-000000000003";

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

// engenty.app-coder is not a builtin — it's registered by the (optional,
// tenant-scoped) engenty-apps module. Stub it so tests can assemble the
// copilot's full subAgents tree the same way a tenant with that module
// active would; production never resolves subAgents eagerly like this (see
// conversation-run.ts's skipSubAgents + lazy per-delegation-tool-call
// resolution), so an inactive module there degrades to a failed tool call,
// not a broken assembly.
function builtinProviderWithAppCoderStub(): CompositeAiRegistry {
  return new CompositeAiRegistry([
    createBuiltinProvider(),
    // engenty.file-analyst is a function agent (referenced from the
    // copilot's subAgents), so the eager-assembly tests need its provider.
    new FunctionAgentProvider(builtinFunctionAgents),
    provider({
      getAgentConfig: vi.fn(async (id) =>
        id === "engenty.app-coder"
          ? {
              id: "engenty.app-coder",
              instructions: "app-coder-skill",
              model: "openai/app-coder",
              name: "App Coder",
              skillIds: [],
              toolIds: [],
            }
          : undefined
      ),
    }),
  ]);
}

function makeSession(agentId = "engenty.copilot"): ThreadRow {
  return {
    agent_id: agentId,
    archived_at: null,
    created_at: "2026-05-17T00:00:00.000Z",
    created_by_user_id: userId,
    id: threadId,
    metadata: {},
    route_context: { thread_id: threadId },
    status: "idle",
    summary: null,
    tenant_id: tenantId,
    title: null,
    updated_at: "2026-05-17T00:00:01.000Z",
    space_id: null,
    visibility: "space",
    workspace_key: null,
  };
}

function makeMessage(
  overrides: Partial<ThreadMessageRow> = {}
): ThreadMessageRow {
  return {
    author_user_id: userId,
    created_at: "2026-05-17T00:00:00.500Z",
    id: "00000000-0000-4000-8000-000000000004",
    parts: [{ text: "Use the supervisor path", type: "text" }],
    role: "user",
    thread_id: threadId,
    tenant_id: tenantId,
    ...overrides,
  };
}

function makeStore(overrides: Partial<ThreadStore> = {}): ThreadStore {
  const thread = makeSession("supervisor");
  return {
    appendMessage: vi.fn(async () => ({
      message: makeMessage({
        author_user_id: null,
        id: "00000000-0000-4000-8000-000000000005",
        role: "assistant",
      }),
    })),
    createThread: vi.fn(async () => ({ thread })),
    deleteThreadForUser: vi.fn(async () => ({ deleted: true })),
    deleteThreadsForUser: vi.fn(async () => ({ deleted: 1 })),
    getThread: vi.fn(async () => thread),
    getThreadGlobally: vi.fn(async () => thread),
    getThreadObservationalMemory: vi.fn(async () => null),
    listMessagesByIds: vi.fn(async ({ messageIds }) =>
      [makeMessage()].filter((message) => messageIds.includes(message.id))
    ),
    listMessagesOrdered: vi.fn(async () => [makeMessage()]),
    listHeadlessThreadsForTask: vi.fn(async () => []),
    listRunThreadsForSpaceAgent: vi.fn(async () => []),
    listLatestMessagesForThreads: vi.fn(async () => new Map()),
    listAppReleaseMarkersForThreads: vi.fn(async () => []),
    listUnattendedThreadsForSpace: vi.fn(async () => []),
    addAgentMember: vi.fn(async () => {}),
    listAgentMembers: vi.fn(async () => []),
    listDmsForUser: vi.fn(async () => []),
    listRoomsForSpace: vi.fn(async () => []),
    listSpaceRoomsDirectory: vi.fn(async () => []),
    listParticipantThreadIds: vi.fn(async () => []),
    setThreadVisibility: vi.fn(async () => thread),
    removeAgentMember: vi.fn(async () => {}),
    addUserParticipant: vi.fn(async () => {}),
    listUserParticipants: vi.fn(async () => []),
    removeUserParticipant: vi.fn(async () => {}),
    listThreadsForSpaceAgent: vi.fn(async () => []),
    listThreadsForUser: vi.fn(async () => [thread]),
    setThreadStatus: vi.fn(async () => {}),
    updateMessageParts: vi.fn(async (input) => ({
      message: makeMessage({
        author_user_id: null,
        id: input.messageId,
        parts: input.parts,
        role: "assistant",
      }),
    })),
    mergeThreadMetadataForUser: vi.fn(async () => ({ thread })),
    updateThreadForUser: vi.fn(async () => ({ thread })),
    upsertThread: vi.fn(async () => ({ thread })),
    ...overrides,
  };
}

describe("dynamic AI registry", () => {
  it("resolves capabilities by provider order", async () => {
    const firstConfig: AgentConfig = {
      id: "agent",
      instructions: "first",
      model: "openai/first",
      name: "First",
      skillIds: [],
      toolIds: [],
    };
    const secondConfig: AgentConfig = {
      ...firstConfig,
      instructions: "second",
      model: "openai/second",
      name: "Second",
    };
    const registry = new CompositeAiRegistry([
      provider({
        providerId: "first",
        getAgentConfig: vi.fn(async () => firstConfig),
      }),
      provider({
        providerId: "second",
        getAgentConfig: vi.fn(async () => secondConfig),
      }),
    ]);

    await expect(registry.getAgentConfig("agent")).resolves.toBe(firstConfig);
  });

  it("returns undefined when no provider has the requested id", async () => {
    const registry = new CompositeAiRegistry([
      provider({ providerId: "first" }),
      provider({ providerId: "second" }),
    ]);

    await expect(registry.getTool("missing")).resolves.toBeUndefined();
  });

  it("loads module capabilities through an injected discovery seam", async () => {
    const moduleTool = { id: "module-tool" } satisfies MastraToolDefinition;
    const loader = {
      listModuleCapabilities: vi.fn(async () => [
        {
          agentConfigs: [
            {
              id: "module_agent",
              instructions: "Module instructions",
              model: "openai/module",
              name: "Module Agent",
              skillIds: ["module-skill"],
              toolIds: ["module-tool"],
            },
          ],
          moduleId: "module",
          skills: { "module-skill": "Module skill instructions" },
          tools: { "module-tool": moduleTool },
        },
      ]),
    };
    const registry = new ModuleProvider(loader);

    await expect(
      registry.getAgentConfig("module_agent")
    ).resolves.toMatchObject({
      id: "module_agent",
      source: "module",
    });
    await expect(registry.getTool("module-tool")).resolves.toBe(moduleTool);
    expect(loader.listModuleCapabilities).toHaveBeenCalledTimes(1);
  });

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
        expect.objectContaining({ id: "engenty.cli", source: "builtin" }),
      ])
    );
  });

  it("creates and resolves sessions with module capability agent ids", async () => {
    const moduleThread = makeSession("contacts.manager");
    const store = makeStore({
      getThread: vi.fn(async () => moduleThread),
      upsertThread: vi.fn(async (input) => ({
        thread: makeSession(input.agentId),
      })),
    });
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
          // Module specialists now carry the catalog floor; assembly looks
          // each id up on this provider, so the floor has to exist here.
          tools: Object.fromEntries(
            LIVE_HIRE_TOOL_IDS.map((id) => [id, { id }])
          ),
        },
      ]),
    };
    const harness = createThreadService({
      createRegistry: () => new ModuleProvider(loader),
      getStore: () => store,
      getUsageStore: () => null,
      mastra: {} as never,
    });

    await expect(
      harness.createThread({
        agentId: "contacts.manager",
        scope: { tenantId, userId },
      })
    ).resolves.toMatchObject({
      thread: { agent_id: "contacts.manager" },
    });
    await expect(
      harness.assertNativeMemoryAvailable({
        scope: { tenantId, userId },
        threadId,
      })
    ).resolves.toBeUndefined();
  });

  it("keeps database provider inert until a store is injected", async () => {
    const registry = new DatabaseProvider();

    await expect(registry.getAgentConfig("db_agent")).resolves.toBeUndefined();
    await expect(registry.getTool("db-tool")).resolves.toBeUndefined();
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

    await expect(registry.getAgentConfig("db_agent")).resolves.toMatchObject({
      id: "db_agent",
      source: "database",
    });
    await expect(registry.getTool("db-tool")).resolves.toEqual({
      id: "db-tool",
    });
    expect(store.getAgentConfig).toHaveBeenCalledWith(tenantId, "db_agent");
    expect(store.getTool).toHaveBeenCalledWith(tenantId, "db-tool");
  });

  it("refuses database-backed dynamic tool execution until an execution policy exists", async () => {
    const dbTool = createNonExecutableDatabaseTool({
      endpointUrl: "https://tools.example.test/search",
      id: "db-search",
      name: "DB Search",
      schemaJson: {
        properties: { query: { type: "string" } },
        type: "object",
      },
    });
    const registry = provider({
      getAgentConfig: vi.fn(async () => ({
        id: "agent",
        instructions: "Use the database tool.",
        model: "openai/test",
        name: "Agent",
        skillIds: [],
        toolIds: ["db-search"],
      })),
      getTool: vi.fn(async (id) => (id === "db-search" ? dbTool : undefined)),
    });

    const agent = (await assembleDynamicAgent(
      registry,
      "agent"
    )) as unknown as {
      config: {
        tools: Record<
          string,
          {
            description: string;
            execute: (input: Record<string, unknown>) => Promise<unknown>;
          }
        >;
      };
    };

    expect(agent.config.tools).toHaveProperty("db-search");
    expect(agent.config.tools["db-search"].description).toContain(
      "metadata-only"
    );
    await expect(
      agent.config.tools["db-search"].execute({ query: "contacts" })
    ).resolves.toMatchObject({
      code: "dynamic_tool_not_executable",
      missingExecutionMetadata: expect.arrayContaining([
        "allowed host policy",
        "auth model",
        "tenant/user context propagation contract",
      ]),
      ok: false,
      tool: {
        endpointUrl: "https://tools.example.test/search",
        id: "db-search",
      },
    });
  });

  it("assembles an agent with a preferred-skill hint and resolved tools", async () => {
    const searchTool = { id: "search" } satisfies MastraToolDefinition;
    const registry = provider({
      getAgentConfig: vi.fn(async () => ({
        id: "agent",
        instructions: "Base instructions",
        model: "openai/test",
        name: "Agent",
        skillIds: ["skill-one"],
        toolIds: ["search"],
      })),
      getTool: vi.fn(async (id) => (id === "search" ? searchTool : undefined)),
    });

    const agent = (await assembleDynamicAgent(
      registry,
      "agent"
    )) as unknown as {
      config: {
        instructions: string;
        model: string;
        tools: Record<string, MastraToolDefinition>;
      };
    };

    expect(agent.config.model).toMatchObject({
      modelId: "openai/test",
      provider: "gateway",
    });
    expect(agent.config.instructions).toContain("Base instructions");
    // Skills are no longer inlined; only a preferred-skill hint is injected.
    expect(agent.config.instructions).not.toContain("### ACTIVE SKILLS ###");
    expect(agent.config.instructions).toContain("Preferred skills: skill-one");
    // Presentation tools ride every root assembly; the config tool stays.
    expect(Object.keys(agent.config.tools).sort()).toEqual([
      "search",
      "show_artifact",
      "show_objects",
      "show_ui",
      "show_widget",
    ]);
    expect(agent.config.tools.search).toBe(searchTool);
  });

  it("assembles configured sub-agents for Mastra supervisor agents", async () => {
    const configs: Record<string, AgentConfig> = {
      "contacts-agent": {
        description: "Find and update contacts.",
        id: "contacts-agent",
        instructions: "Help with contacts.",
        model: "openai/contacts",
        name: "Contacts Agent",
        skillIds: [],
        toolIds: [],
      },
      supervisor: {
        description: "Route user requests to specialist agents.",
        id: "supervisor",
        instructions: "Delegate to the best specialist.",
        model: "openai/supervisor",
        name: "Supervisor",
        skillIds: [],
        subAgents: [{ alias: "contacts", id: "contacts-agent" }],
        toolIds: [],
      },
    };
    const registry = provider({
      getAgentConfig: vi.fn(async (id) => configs[id]),
    });

    const agent = (await assembleDynamicAgent(
      registry,
      "supervisor"
    )) as unknown as {
      config: {
        agents: Record<string, { config: { description: string } }>;
        description: string;
      };
    };

    expect(agent.config.description).toBe(
      "Route user requests to specialist agents."
    );
    expect(Object.keys(agent.config.agents)).toEqual(["contacts"]);
    expect(agent.config.agents.contacts.config.description).toBe(
      "Find and update contacts."
    );
  });

  it("applies tenant model config to supervisors and sub-agents", async () => {
    const configs: Record<string, AgentConfig> = {
      specialist: {
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
        routingModelId: "openai/tenant-routing",
      },
    })) as unknown as {
      config: {
        agents: Record<string, { config: { model: string } }>;
        model: string;
      };
    };

    expect(agent.config.model).toMatchObject({
      modelId: "openai/tenant-routing",
      provider: "gateway",
    });
    expect(agent.config.agents.specialist.config.model).toMatchObject({
      modelId: "openai/tenant-chat",
      provider: "gateway",
    });
  });

  it("applies tenant model config to the builtin Engenty Copilot supervisor", async () => {
    const agent = (await assembleDynamicAgent(
      builtinProviderWithAppCoderStub(),
      "engenty.copilot",
      {
        modelConfig: {
          chatModelId: "openai/tenant-chat",
          routingModelId: "openai/tenant-routing",
        },
      }
    )) as unknown as {
      config: {
        agents: Record<string, { config: { model: string } }>;
        model: string;
      };
    };

    expect(agent.config.model).toMatchObject({
      modelId: "openai/tenant-routing",
      provider: "gateway",
    });
    expect(agent.config.agents.engenty_cli.config.model).toMatchObject({
      modelId: "openai/tenant-chat",
      provider: "gateway",
    });
  });

  it("passes Mastra and background-task config into dynamic supervisors", async () => {
    const mastra = { backgroundTaskManager: {} };
    const configs: Record<string, AgentConfig> = {
      specialist: {
        id: "specialist",
        instructions: "Handle slow specialist work.",
        model: "openai/specialist",
        name: "Specialist",
        skillIds: [],
        toolIds: [],
      },
      supervisor: {
        backgroundTasks: {
          tools: {
            specialist: { enabled: true, timeoutMs: 900_000 },
          },
          waitTimeoutMs: 1000,
        },
        id: "supervisor",
        instructions: "Delegate long-running work.",
        model: "openai/supervisor",
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
      mastra: mastra as never,
    })) as unknown as {
      config: {
        agents: Record<string, { config: { mastra: unknown } }>;
        backgroundTasks: unknown;
        mastra: unknown;
      };
    };

    expect(agent.config.mastra).toBe(mastra);
    expect(agent.config.agents.specialist.config.mastra).toBe(mastra);
    expect(agent.config.backgroundTasks).toEqual({
      tools: {
        specialist: { enabled: true, timeoutMs: 900_000 },
      },
      waitTimeoutMs: 1000,
    });
  });

  it("throws a harness error for missing sub-agent configs", async () => {
    await expect(
      assembleDynamicAgent(
        provider({
          getAgentConfig: vi.fn(async (id) =>
            id === "supervisor"
              ? {
                  id: "supervisor",
                  instructions: "Delegate.",
                  model: "openai/supervisor",
                  name: "Supervisor",
                  skillIds: [],
                  subAgents: [{ id: "missing-specialist" }],
                  toolIds: [],
                }
              : undefined
          ),
        }),
        "supervisor"
      )
    ).rejects.toMatchObject({
      code: "agent_threads.unknownAgentType",
      details: { agent_id: "missing-specialist" },
    });
  });

  it("preserves supervisor skills and tools when sub-agents are attached", async () => {
    const supervisorTool = {
      id: "supervisor-tool",
    } satisfies MastraToolDefinition;
    const specialistTool = {
      id: "specialist-tool",
    } satisfies MastraToolDefinition;
    const configs: Record<string, AgentConfig> = {
      specialist: {
        id: "specialist",
        instructions: "Specialist instructions.",
        model: "openai/specialist",
        name: "Specialist",
        skillIds: ["specialist-skill"],
        toolIds: ["specialist-tool"],
      },
      supervisor: {
        id: "supervisor",
        instructions: "Supervisor instructions.",
        model: "openai/supervisor",
        name: "Supervisor",
        skillIds: ["supervisor-skill"],
        subAgents: [{ id: "specialist" }],
        toolIds: ["supervisor-tool"],
      },
    };
    const registry = provider({
      getAgentConfig: vi.fn(async (id) => configs[id]),
      getTool: vi.fn(async (id) => {
        if (id === "supervisor-tool") {
          return supervisorTool;
        }
        if (id === "specialist-tool") {
          return specialistTool;
        }
        return;
      }),
    });

    const agent = (await assembleDynamicAgent(
      registry,
      "supervisor"
    )) as unknown as {
      config: {
        agents: Record<
          string,
          {
            config: {
              instructions: string;
              tools: Record<string, MastraToolDefinition>;
            };
          }
        >;
        instructions: string;
        tools: Record<string, MastraToolDefinition>;
      };
    };

    expect(agent.config.instructions).toContain("supervisor-skill");
    expect(agent.config.tools["supervisor-tool"]).toBe(supervisorTool);
    expect(agent.config.tools).toHaveProperty("show_objects");
    expect(agent.config.agents.specialist.config.instructions).toContain(
      "specialist-skill"
    );
    expect(agent.config.agents.specialist.config.tools).toEqual({
      "specialist-tool": specialistTool,
    });
  });

  it("assembles the built-in Engenty Copilot config as a supervisor-ready agent", async () => {
    const agent = (await assembleDynamicAgent(
      builtinProviderWithAppCoderStub(),
      "engenty.copilot"
    )) as unknown as {
      config: {
        agents: Record<
          string,
          {
            config: {
              description: string;
              tools: Record<string, MastraToolDefinition>;
            };
          }
        >;
        backgroundTasks: unknown;
        description: string;
        inputProcessors?: { id: string }[];
        instructions: string;
        tools: Record<string, MastraToolDefinition>;
      };
    };

    expect(agent.config.description).toContain("Live front-door copilot");
    expect(agent.config.instructions).toContain(
      "You are engenty — the in-app AI **copilot**"
    );
    expect(agent.config.instructions).toContain("Runtime context");
    expect(agent.config.instructions).toContain(
      "Tenant and user are request-scoped"
    );
    // The catalog vocabulary, asserted where it now lives once: SOUL.md used to
    // repeat AGENTS.md's catalog section under its own heading, and the layer
    // dedup dropped the copy, not the doctrine.
    expect(agent.config.instructions).toContain("engenty_tools_search");
    expect(agent.config.instructions).toContain("Space contract");
    expect(agent.config.instructions).toContain("requestDecision");
    // The catalog-only write rule (AGENTS.md rule 1). Asserted on the rule's
    // substance, not its old phrasing: it was "Prefer backend APIs" until the
    // instructions were tightened to make catalog operations the ONLY write path.
    expect(agent.config.instructions).toContain(
      "Backend tools are the only way you write data"
    );
    // Was `toBeUndefined()` — "the copilot never dispatches a tool call to the
    // background". It now says so explicitly instead of by omission, because
    // omission was not free: with the manager enabled instance-wide, Mastra
    // splices its `_background` override into EVERY tool's schema (measured at
    // 115 KB across 59 tools, 39% of the prompt) and only `disabled` stops it.
    expect(agent.config.backgroundTasks).toEqual({ disabled: true });
    // Lane tools ride with their lane skill. The processor is what withholds
    // them, and the instructions are what stop the model reading a withheld
    // tool as a missing capability — neither is optional on its own.
    expect(
      agent.config.inputProcessors?.map((processor) => processor.id)
    ).toContain("skill-gated-tools");
    expect(agent.config.instructions).toContain(
      "Tools that arrive with a skill"
    );
    // All specialists declared in engentyCopilotAgentConfig.subAgents:
    // engenty_cli (CLI/sandbox work), file_analyst (tiered attachments), and
    // app_coder (app-building, stubbed above since it's module-provided).
    // Keep in sync with modules/engenty-copilot/ai/agents/engenty.copilot/agent.ts.
    expect(Object.keys(agent.config.agents)).toEqual([
      "engenty_cli",
      "file_analyst",
      "app_coder",
    ]);
    expect(agent.config.tools).toHaveProperty("chatThreadSearch");
    // AG-UI frontend tools are no longer a static meta-tool on the agent config;
    // they are injected per-run as native tools (see native-frontend-tool.ts).
    expect(agent.config.tools).not.toHaveProperty("invoke_frontend_tool");
    expect(agent.config.tools).toHaveProperty("requestDecision");
    expect(agent.config.tools).toHaveProperty("web_search");
    // Catalog runner tools attach directly — no engenty-tools sub-agent hop.
    expect(agent.config.tools).toHaveProperty("engenty_tools_context");
    expect(agent.config.tools).toHaveProperty("engenty_tools_modules");
    expect(agent.config.tools).toHaveProperty("engenty_tools_search");
    expect(agent.config.tools).toHaveProperty("engenty_tool_execute");
    // One combined `vault_files` (action discriminator), not the five granular
    // vault tools: schemas ride in every model call and vault IO is rare.
    expect(agent.config.tools).toHaveProperty("vault_files");
    expect(agent.config.tools).not.toHaveProperty("vault_list_files");
    expect(agent.config.agents.engenty_cli.config.tools).toHaveProperty(
      "engenty_tools_search"
    );
    expect(agent.config.agents.engenty_cli.config.tools).toHaveProperty(
      "engenty_tool_execute"
    );
  });

  it("assembles a module agent with catalog-backed tools", async () => {
    const moduleTool = { id: "kb_search" } as MastraToolDefinition;
    const loader = {
      listModuleCapabilities: vi.fn(async () => [
        {
          agentConfigs: [
            {
              id: "knowledge-base.manager",
              instructions:
                "Use registered Knowledge Base tools. Available module tools:\n- kb.search",
              model: "openai/module",
              name: "Knowledge Base Manager",
              skillIds: [],
              toolIds: ["kb_search", "web_search"],
            },
          ],
          moduleId: "knowledge-base",
          tools: {
            kb_search: moduleTool,
          },
        },
      ]),
    };
    const agent = (await assembleDynamicAgent(
      createDefaultAiRegistry({
        moduleLoader: loader,
        tenantId,
      }),
      "knowledge-base.manager"
    )) as unknown as {
      config: {
        instructions: string;
        tools: Record<string, MastraToolDefinition>;
      };
    };

    expect(agent.config.tools).toHaveProperty("kb_search");
    expect(agent.config.tools).toHaveProperty("web_search");
    expect(agent.config.instructions).not.toContain("### ACTIVE SKILLS ###");
    expect(agent.config.instructions).toContain("kb.search");
  });

  it("assembles module web_search as an executable function tool", async () => {
    const loader = {
      listModuleCapabilities: vi.fn(async () => [
        {
          agentConfigs: [
            {
              id: "contacts.manager",
              instructions: "Use contacts tools.",
              model: "openai/module",
              name: "Contacts Manager",
              skillIds: [],
              toolIds: ["web_search"],
            },
          ],
          moduleId: "contacts",
        },
      ]),
    };
    const agent = (await assembleDynamicAgent(
      createDefaultAiRegistry({
        moduleLoader: loader,
        tenantId,
      }),
      "contacts.manager"
    )) as unknown as {
      config: {
        tools: Record<string, { type?: string }>;
      };
    };

    expect(agent.config.tools.web_search).toBeDefined();
    expect(agent.config.tools.web_search?.type).not.toBe("provider");
  });

  it("exposes shared web_search as a built-in dynamic tool", async () => {
    const provider = createBuiltinProvider();

    await expect(provider.getTool("web_search")).resolves.toMatchObject({
      id: "web_search",
    });
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
    // The agent resolves, but it declares a tool the registry can't provide
    // (e.g. a module-local tool that doesn't cross into apps/ai).
    await expect(
      assembleDynamicAgent(
        provider({
          getAgentConfig: vi.fn(async (id: string) =>
            id === "agent-with-missing-tool"
              ? {
                  id: "agent-with-missing-tool",
                  description: "Declares a tool that does not exist.",
                  instructions: "Work.",
                  model: "openai/test",
                  name: "Tool Agent",
                  skillIds: [],
                  toolIds: ["nonexistent-tool"],
                }
              : undefined
          ),
          // getTool stays the default vi.fn(async () => undefined)
        }),
        "agent-with-missing-tool"
      )
    ).rejects.toMatchObject({
      code: "agent_threads.unknownTool",
      details: { missing_tool_id: "nonexistent-tool" },
    });
  });
});
