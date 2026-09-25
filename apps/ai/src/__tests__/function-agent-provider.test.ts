import type { AgentFnDescriptor } from "@engenty/ai-core";
import {
  useEffort,
  useModel,
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
import { bindTestModelsPerTest } from "./helpers/test-model-bindings.js";

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
        useEffort("high");
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

bindTestModelsPerTest();

describe("FunctionAgentProvider", () => {
  it("state written in turn N changes the render in turn N+1", async () => {
    const channel = memoryChannel();
    const provider = new FunctionAgentProvider([phaseAgent()], channel);
    const first = await provider.getAgentConfig("test.phase-agent", CONTEXT);
    expect(first?.instructions).toBe("Phase one.");
    const rendered = (
      first as unknown as Record<symbol, Record<string, typeof echoTool>>
    )[Symbol.for("engenty.ai.renderedTools")];
    await rendered?.advance?.execute();
    expect(channel.state).toEqual({ phase: "two" });
    const second = await provider.getAgentConfig("test.phase-agent", CONTEXT);
    expect(second?.instructions).toBe("Phase two.");
    expect(second?.effort).toBe("high");
    expect(second?.toolIds).toEqual(["registered_tool"]);
  });

  it("replaces a module's agent.json config of the same id in the default registry", async () => {
    const registry = createDefaultAiRegistry({
      functionAgents: [phaseAgent()],
      moduleLoader: {
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
      },
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

  it("merges rendered inline tools, with runtime extraTools winning a name clash", async () => {
    const agent = await assembleDynamicAgent(
      registryWith({
        fn: () => {
          useTool("inline_tool", echoTool);
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
    expect(Object.keys(tools)).toContain("inline_tool");
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
    });
    expect(resolved).toBe("allowed/chat");
  });
});

describe("createSessionAgentStateChannel", () => {
  it("persists only its own metadata key and loads it back", async () => {
    // Writing the whole metadata object would revert concurrent writes to
    // other keys.
    const rows = new Map<string, Record<string, unknown>>();
    const store = {
      getThread: async (p: { threadId: string }) => ({
        metadata: rows.get(p.threadId) ?? {},
      }),
      mergeThreadMetadataForUser: vi.fn(
        async (p: { patch?: Record<string, unknown>; threadId: string }) => {
          rows.set(p.threadId, {
            ...(rows.get(p.threadId) ?? {}),
            ...(p.patch ?? {}),
          });
          return { thread: {} };
        }
      ),
    };
    const channel = createSessionAgentStateChannel(() => store);
    await channel.persist(CONTEXT, { phase: "two" });
    expect(store.mergeThreadMetadataForUser.mock.calls[0]?.[0].patch).toEqual({
      agent_state: { phase: "two" },
    });
    expect(await channel.load(CONTEXT)).toEqual({ phase: "two" });
  });

  it("throws loudly when the ownership-checked update rejects", async () => {
    const store = {
      getThread: async () => ({ metadata: {} }),
      mergeThreadMetadataForUser: async () => ({ thread: null }),
    };
    const channel = createSessionAgentStateChannel(() => store);
    await expect(channel.persist(CONTEXT, { k: 1 })).rejects.toThrow(
      /not owned by user/
    );
  });
});
