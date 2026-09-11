import { ENGENTY_DEBUG_INITIAL_PROMPT_EVENT } from "@engenty/ag-ui-bridge";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  emitTrajectoryHeader,
  listKnownToolNames,
  recallTrajectoryMessagePointers,
  toRecalledMessagePointers,
} from "../emit-trajectory-header.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("listKnownToolNames", () => {
  it("unions agent tools with extras and survives listTools throwing", async () => {
    expect(
      await listKnownToolNames(
        { listTools: async () => ({ navigate: {}, search: {} }) },
        { search: {}, extra: {} }
      )
    ).toEqual(["navigate", "search", "extra"]);

    const warn = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(
      await listKnownToolNames(
        {
          listTools: async () => {
            throw new Error("no tools");
          },
        },
        { navigate: {} }
      )
    ).toEqual(["navigate"]);
    expect(warn).toHaveBeenCalled();
  });

  it("calls listTools on the agent so private fields resolve", async () => {
    // Mastra's Agent.listTools reads `this.#tools` — an unbound call throws
    // "Cannot read properties of undefined (reading '#tools')".
    class AgentWithPrivateTools {
      readonly #tools = { navigate: {}, search: {} };
      listTools() {
        return this.#tools;
      }
    }

    expect(await listKnownToolNames(new AgentWithPrivateTools())).toEqual([
      "navigate",
      "search",
    ]);
  });
});

describe("emitTrajectoryHeader", () => {
  it("emits SYSTEM + CONTEXT + tool names as a CUSTOM event", async () => {
    const emitted: unknown[] = [];
    await emitTrajectoryHeader({
      agent: { getInstructions: () => "You are the copilot." },
      emit: (event) => emitted.push(event),
      extraSystemNote: "You are running on Mastra's durable agent stream.",
      runtimeInstructions: "Space: company",
      toolNames: ["navigate", ""],
    });

    expect(emitted).toEqual([
      {
        name: ENGENTY_DEBUG_INITIAL_PROMPT_EVENT,
        type: "CUSTOM",
        value: {
          runtimeContextInstructions: "Space: company",
          systemInstructions:
            "You are the copilot.\n\nYou are running on Mastra's durable agent stream.",
          toolNames: ["navigate"],
        },
      },
    ]);
  });

  it("emits recalled message pointers on the same CUSTOM event", async () => {
    const emitted: unknown[] = [];
    await emitTrajectoryHeader({
      agent: { getInstructions: () => "You are the copilot." },
      emit: (event) => emitted.push(event),
      recalledMessages: [
        {
          chars: 48,
          id: "msg-1",
          preview: "Aktienkurse alle 10 Minuten",
          role: "user",
        },
      ],
      runtimeInstructions: "",
      toolNames: [],
    });
    expect(
      (emitted[0] as { value: { recalledMessages: unknown[] } }).value
        .recalledMessages
    ).toEqual([
      {
        chars: 48,
        id: "msg-1",
        preview: "Aktienkurse alle 10 Minuten",
        role: "user",
      },
    ]);
  });

  it("does not fail the run when getInstructions throws", async () => {
    const emitted: unknown[] = [];
    const warn = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await emitTrajectoryHeader({
      agent: {
        getInstructions: () => {
          throw new Error("no instructions");
        },
      },
      emit: (event) => emitted.push(event),
      runtimeInstructions: "",
      toolNames: ["search"],
    });
    expect(emitted).toHaveLength(1);
    expect(
      (emitted[0] as { value: { systemInstructions: string } }).value
        .systemInstructions
    ).toBe("");
    expect(warn).toHaveBeenCalled();
  });

  it("emits nothing when the snapshot would be empty", async () => {
    const emit = vi.fn();
    await emitTrajectoryHeader({
      agent: {},
      emit,
      runtimeInstructions: "   ",
      toolNames: [],
    });
    expect(emit).not.toHaveBeenCalled();
  });

  it("calls getInstructions on the agent so Mastra keeps `this`", async () => {
    class FakeAgent {
      prompt = "You are the copilot.";
      getInstructions() {
        return this.prompt;
      }
    }
    const emitted: unknown[] = [];
    await emitTrajectoryHeader({
      agent: new FakeAgent(),
      emit: (event) => emitted.push(event),
      runtimeInstructions: "",
      toolNames: [],
    });
    expect(
      (emitted[0] as { value: { systemInstructions: string } }).value
        .systemInstructions
    ).toBe("You are the copilot.");
  });

  it("invokes a nested getInstructions callback instead of flattening the function", async () => {
    const emitted: unknown[] = [];
    await emitTrajectoryHeader({
      agent: {
        getInstructions: () => () => "You are the copilot.",
      },
      emit: (event) => emitted.push(event),
      runtimeInstructions: "",
      toolNames: [],
    });
    expect(
      (emitted[0] as { value: { systemInstructions: string } }).value
        .systemInstructions
    ).toBe("You are the copilot.");
  });
});

describe("toRecalledMessagePointers", () => {
  it("keeps id, role, size, and a 100-char preview — not the body", () => {
    const long = "x".repeat(140);
    expect(
      toRecalledMessagePointers([{ content: long, id: "msg-1", role: "user" }])
    ).toEqual([
      {
        authorUserId: null,
        chars: JSON.stringify({ content: long, id: "msg-1", role: "user" })
          .length,
        id: "msg-1",
        preview: "x".repeat(100),
        role: "user",
      },
    ]);
  });

  it("reads a Mastra format-2 message's id and text parts", () => {
    const pointers = toRecalledMessagePointers([
      {
        content: {
          format: 2,
          parts: [{ text: "Aktienkurse alle 10 Minuten", type: "text" }],
        },
        id: "11111111-1111-4111-8111-111111111111",
        role: "user",
      },
    ]);
    expect(pointers).toEqual([
      {
        authorUserId: null,
        chars: expect.any(Number),
        id: "11111111-1111-4111-8111-111111111111",
        preview: "Aktienkurse alle 10 Minuten",
        role: "user",
      },
    ]);
    expect(pointers[0]?.chars).toBeGreaterThan(20);
  });

  it("records the persisted author and strips speaker-turn tags from the preview", () => {
    expect(
      toRecalledMessagePointers([
        {
          content: {
            format: 2,
            metadata: { author_user_id: "user-1" },
            parts: [
              {
                text: '<turn author_id="user-1" author_name="Ada" functional_role="user">\nplease check quotes\n</turn>',
                type: "text",
              },
            ],
          },
          id: "human-1",
          role: "user",
        },
        {
          content: {
            format: 2,
            metadata: { author_user_id: null },
            parts: [{ text: "run the tick", type: "text" }],
          },
          id: "synth-1",
          role: "user",
        },
      ])
    ).toEqual([
      {
        authorUserId: "user-1",
        chars: expect.any(Number),
        id: "human-1",
        preview: "please check quotes",
        role: "user",
      },
      {
        authorUserId: null,
        chars: expect.any(Number),
        id: "synth-1",
        preview: "run the tick",
        role: "user",
      },
    ]);
  });
});

describe("recallTrajectoryMessagePointers", () => {
  it("snapshots what memory.recall returned", async () => {
    const recall = vi.fn(async () => ({
      messages: [{ content: "hello world", id: "msg-1", role: "user" }],
    }));
    await expect(
      recallTrajectoryMessagePointers({
        memory: { recall } as unknown as Parameters<
          typeof recallTrajectoryMessagePointers
        >[0]["memory"],
        resourceId: "res-1",
        threadId: "thread-1",
      })
    ).resolves.toEqual([
      {
        authorUserId: null,
        chars: JSON.stringify({
          content: "hello world",
          id: "msg-1",
          role: "user",
        }).length,
        id: "msg-1",
        preview: "hello world",
        role: "user",
      },
    ]);
    expect(recall).toHaveBeenCalledWith({
      resourceId: "res-1",
      threadId: "thread-1",
    });
  });

  it("returns [] when recall throws", async () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      recallTrajectoryMessagePointers({
        memory: {
          recall: async () => {
            throw new Error("down");
          },
        },
        resourceId: "res-1",
        threadId: "thread-1",
      })
    ).resolves.toEqual([]);
    expect(warn).toHaveBeenCalled();
  });
});
