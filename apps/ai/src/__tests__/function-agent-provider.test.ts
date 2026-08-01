import type { AgentFnDescriptor } from "@engenty/ai-core";
import {
  useModel,
  usePurpose,
  useRegisteredTool,
  useThreadState,
  useTool,
} from "@engenty/ai-core";
import { describe, expect, it, vi } from "vitest";
import { createDefaultAiRegistry } from "../ai/agents.js";
import {
  assembleDynamicAgent,
  resolveAgentModelId,
} from "../ai/registry/assemble-dynamic-agent.js";
import { CompositeAiRegistry } from "../ai/registry/composite-ai-registry.js";
import {
  createSessionAgentStateChannel,
  FunctionAgentProvider,
  type FunctionAgentStateChannel,
} from "../ai/registry/function-provider.js";
import { ModuleProvider } from "../ai/registry/module-provider.js";

const CONTEXT = { tenantId: "t1", threadId: "th1", userId: "u1" };

const echoTool = {
  description: "echo",
  execute: async () => "ok",
};

function phaseAgent(): AgentFnDescriptor {
  return {
    fn: () => {
      const [phase, setPhase] = useThreadState("phase", "one");
      if (phase === "one") {
        useTool("advance", {
          description: "advance",
          execute: async () => {
            await setPhase("two");
            return "advanced";
          },
        });
      }
      if (phase === "two") {
        usePurpose("planning_coding");
        useRegisteredTool("registered_tool");
      }
      return `Phase ${phase}.`;
    },
    id: "test.phase-agent",
    name: "Phase Agent",
  };
}

function memoryChannel(
  initial: Record<string, unknown> = {}
): FunctionAgentStateChannel & { state: Record<string, unknown> } {
  const holder = { state: initial };
  return {
    get state() {
      return holder.state;
    },
    load: async () => holder.state,
    persist: async (_ctx, state) => {
      holder.state = state;
    },
  };
}

describe("FunctionAgentProvider", () => {
  it("renders bare (base face) without a resolve context", async () => {
    const provider = new FunctionAgentProvider([phaseAgent()], memoryChannel());
    const config = await provider.getAgentConfig("test.phase-agent");
    expect(config?.instructions).toBe("Phase one.");
    expect(config?.purpose).toBeUndefined();
    const listed = await provider.listAgentConfigs();
    expect(listed.map((c) => c.id)).toEqual(["test.phase-agent"]);
  });

  it("state written in turn N changes the render in turn N+1", async () => {
    const channel = memoryChannel();
    const provider = new FunctionAgentProvider([phaseAgent()], channel);
    const first = await provider.getAgentConfig("test.phase-agent", CONTEXT);
    expect(first?.instructions).toBe("Phase one.");
    expect(first?.toolIds).toEqual([]);
    // The model calls the transition tool during the run.
    const rendered = (
      first as unknown as Record<symbol, Record<string, typeof echoTool>>
    )[Symbol.for("engenty.ai.renderedTools")];
    await rendered?.advance?.execute();
    expect(channel.state).toEqual({ phase: "two" });
    // Next turn: fresh resolution over the persisted snapshot.
    const second = await provider.getAgentConfig("test.phase-agent", CONTEXT);
    expect(second?.instructions).toBe("Phase two.");
    expect(second?.purpose).toBe("planning_coding");
    expect(second?.toolIds).toEqual(["registered_tool"]);
  });

  it("beats ModuleProvider in the composite for the same id", async () => {
    const moduleProvider = new ModuleProvider({
      listModuleCapabilities: async () => [
        {
          agentConfigs: [
            {
              id: "test.phase-agent",
              instructions: "From agent.json.",
              model: "m",
              name: "Data Twin",
              skillIds: [],
              toolIds: [],
            },
          ],
          moduleId: "test",
          tools: {},
        },
      ],
    });
    const registry = new CompositeAiRegistry([
      new FunctionAgentProvider([phaseAgent()]),
      moduleProvider,
    ]);
    const config = await registry.getAgentConfig("test.phase-agent");
    expect(config?.instructions).toBe("Phase one.");
  });

  it("is wired into createDefaultAiRegistry via functionAgents", async () => {
    const registry = createDefaultAiRegistry({
      functionAgents: [phaseAgent()],
      stateChannel: memoryChannel({ phase: "two" }),
    });
    const config = await registry.getAgentConfig("test.phase-agent", CONTEXT);
    expect(config?.instructions).toBe("Phase two.");
  });
});

describe("assembleDynamicAgent with function agents", () => {
  const registryWith = (descriptor: AgentFnDescriptor) =>
    new CompositeAiRegistry([
      new FunctionAgentProvider([descriptor], memoryChannel()),
    ]);

  it("merges rendered inline tools into the agent toolset", async () => {
    const agent = await assembleDynamicAgent(
      registryWith({
        fn: () => {
          useTool("inline_tool", echoTool);
          return "Base.";
        },
        id: "test.fn",
        name: "Fn",
      }),
      "test.fn"
    );
    const tools = await agent.listTools();
    expect(Object.keys(tools)).toContain("inline_tool");
  });

  it("extraTools stay authoritative over rendered tools on name clash", async () => {
    const agent = await assembleDynamicAgent(
      registryWith({
        fn: () => {
          useTool("clash", { ...echoTool, description: "rendered" });
          return "Base.";
        },
        id: "test.fn",
        name: "Fn",
      }),
      "test.fn",
      { extraTools: { clash: { ...echoTool, description: "runtime" } } }
    );
    const tools = (await agent.listTools()) as Record<
      string,
      { description?: string }
    >;
    expect(tools.clash?.description).toBe("runtime");
  });

  it("grant-checks a rendered useModel pin (no governance bypass)", async () => {
    const registry = registryWith({
      fn: () => {
        useModel("forbidden/model");
        return "Base.";
      },
      id: "test.fn",
      name: "Fn",
    });
    const config = await registry.getAgentConfig("test.fn");
    expect(config).toBeDefined();
    const resolved = resolveAgentModelId(config ?? ({} as never), {
      chatModelId: "allowed/chat",
      grants: { allowed_models: ["allowed/chat"] },
      routingModelId: "allowed/chat",
    });
    // The rendered pin is outside the tenant grants → falls through to the
    // governed purpose default, exactly like a row-authored pin.
    expect(resolved).toBe("allowed/chat");
  });
});

describe("createSessionAgentStateChannel", () => {
  it("nests state under metadata.agent_state and merges on persist", async () => {
    const rows = new Map<string, Record<string, unknown>>([
      ["th1", { other_key: "kept" }],
    ]);
    const store = {
      getSession: vi.fn(async (p: { threadId: string }) => ({
        metadata: rows.get(p.threadId) ?? {},
      })),
      updateSessionForUser: vi.fn(
        async (p: { metadata?: Record<string, unknown>; threadId: string }) => {
          rows.set(p.threadId, p.metadata ?? {});
          return { session: {} };
        }
      ),
    };
    const channel = createSessionAgentStateChannel(() => store);
    expect(await channel.load(CONTEXT)).toEqual({});
    await channel.persist(CONTEXT, { phase: "two" });
    expect(rows.get("th1")).toEqual({
      agent_state: { phase: "two" },
      other_key: "kept",
    });
    expect(await channel.load(CONTEXT)).toEqual({ phase: "two" });
  });

  it("throws loudly when the ownership-checked update rejects", async () => {
    const store = {
      getSession: async () => ({ metadata: {} }),
      updateSessionForUser: async () => ({ session: null }),
    };
    const channel = createSessionAgentStateChannel(() => store);
    await expect(channel.persist(CONTEXT, { k: 1 })).rejects.toThrow(
      /not owned by user/
    );
  });
});
