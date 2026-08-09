// The prompt breakdown behind the context meter.
//
// The number this explains is the one users act on ("why is my prompt 31k?"), so
// the section split has to be right: a tool schema counted as history, or a
// message whose tool parts are dropped from its size, sends the reader to prune
// the wrong thing.
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  buildThreadPromptPreview,
  describePromptMessage,
  describePromptTool,
  estimateTokens,
  flattenInstructions,
  renderMessageText,
} from "../prompt-preview.js";

function fakeAgent(input: {
  instructions: unknown;
  tools: Record<string, unknown>;
}) {
  return {
    getInstructions: vi.fn(() => input.instructions),
    getToolsForExecution: vi.fn(() => Promise.resolve(input.tools)),
  } as never;
}

function fakeMemory(messages: unknown[], usageTokens?: number) {
  return {
    recall: vi.fn(() =>
      Promise.resolve({
        messages,
        ...(usageTokens === undefined
          ? {}
          : { usage: { tokens: usageTokens } }),
      })
    ),
  } as never;
}

describe("flattenInstructions", () => {
  it("passes a plain string through", () => {
    expect(flattenInstructions("You are helpful")).toBe("You are helpful");
  });

  it("joins the structured system-message form", () => {
    // Both forms end up as one system block on the wire, so both must be
    // measured as one — an agent on the structured form otherwise reports a
    // system section of zero.
    expect(
      flattenInstructions([
        { content: "SOUL", role: "system" },
        { content: "SKILLS", role: "system" },
      ])
    ).toBe("SOUL\n\nSKILLS");
  });

  it("returns empty for shapes it does not recognise", () => {
    expect(flattenInstructions(null)).toBe("");
    expect(flattenInstructions(42)).toBe("");
  });
});

describe("renderMessageText", () => {
  it("reads string content", () => {
    expect(renderMessageText({ content: "hallo", role: "user" })).toBe("hallo");
  });

  it("collapses a tool part to a marker instead of dumping its arguments", () => {
    // A single tool result can be tens of kilobytes. Its SIZE is what the reader
    // needs; inlining its payload would bury the conversation it sits in.
    const text = renderMessageText({
      content: {
        parts: [
          { text: "Ich schaue nach", type: "text" },
          { toolName: "requestDecision", type: "dynamic-tool" },
        ],
      },
      role: "assistant",
    });
    expect(text).toBe("Ich schaue nach\n[dynamic-tool: requestDecision]");
  });
});

describe("describePromptMessage", () => {
  it("sizes the WHOLE serialized message, not the rendered text", () => {
    // The rendered text hides tool arguments; the prompt does not pay by what we
    // chose to display. Sizing the rendering would under-report every tool-heavy
    // turn — exactly the turns that blow the window.
    const message = {
      content: {
        parts: [
          { text: "ok", type: "text" },
          {
            input: { body: "x".repeat(500) },
            toolName: "requestDecision",
            type: "dynamic-tool",
          },
        ],
      },
      id: "m1",
      role: "assistant",
    };
    const described = describePromptMessage(message);
    expect(described.chars).toBeGreaterThan(500);
    expect(described.text.length).toBeLessThan(100);
    expect(described.id).toBe("m1");
    expect(described.role).toBe("assistant");
  });

  it("survives a message it cannot serialize", () => {
    const cyclic: Record<string, unknown> = { role: "user" };
    cyclic.self = cyclic;
    expect(() => describePromptMessage(cyclic)).not.toThrow();
  });
});

describe("describePromptTool", () => {
  it("counts the input JSON Schema, which is what the provider receives", () => {
    const tool = {
      description: "Ask the user to choose",
      inputSchema: z.object({
        choices: z.array(z.object({ id: z.string(), label: z.string() })),
        title: z.string(),
      }),
    };
    const described = describePromptTool("requestDecision", tool);
    expect(described.schema_chars).toBeGreaterThan(50);
    expect(described.chars).toBeGreaterThan(described.schema_chars);
    expect(described.description).toBe("Ask the user to choose");
  });

  it("reads the AI SDK Schema wrapper, which is what actually arrives", () => {
    // `getToolsForExecution` returns AI SDK CoreTools: `parameters` is the SDK's
    // `Schema` wrapper around an already-converted JSON Schema, NOT a Zod type.
    // Handling only Zod measured every single tool at zero and reported the
    // heaviest section of the prompt as weightless.
    const described = describePromptTool("show_ui", {
      description: "Render UI",
      parameters: {
        jsonSchema: {
          properties: { component: { type: "string" } },
          type: "object",
        },
        validate: () => true,
      },
    });
    expect(described.schema_source).toBe("ai-sdk");
    expect(described.schema_chars).toBeGreaterThan(20);
  });

  it("reads a bare JSON Schema", () => {
    const described = describePromptTool("plain", {
      parameters: { properties: { q: { type: "string" } }, type: "object" },
    });
    expect(described.schema_source).toBe("json-schema");
    expect(described.schema_chars).toBeGreaterThan(20);
  });

  it("says the schema is unreadable rather than reporting a weightless tool", () => {
    const described = describePromptTool("weird", {
      description: "d",
      inputSchema: { not: "a schema" },
    });
    expect(described.schema_source).toBe("none");
    expect(described.schema_chars).toBe(0);
    expect(described.chars).toBe("weird".length + 1);
  });
});

describe("buildThreadPromptPreview", () => {
  const tools = {
    requestDecision: {
      description: "Ask the user to choose",
      inputSchema: z.object({ title: z.string() }),
    },
    tiny: { description: "x", inputSchema: z.object({}) },
  };

  it("splits the prompt into system, tools and history", async () => {
    const preview = await buildThreadPromptPreview({
      agent: fakeAgent({ instructions: "SYSTEM PROMPT", tools }),
      agentId: "engenty.copilot",
      memory: fakeMemory(
        [
          { content: "hallo", id: "m1", role: "user" },
          { content: "hi", id: "m2", role: "assistant" },
        ],
        1234
      ),
      modelId: "deepseek/deepseek-v4-pro",
      resourceId: "user-1",
      threadId: "thread-1",
    });

    expect(preview.system.chars).toBe("SYSTEM PROMPT".length);
    expect(preview.messages).toHaveLength(2);
    expect(preview.tools).toHaveLength(2);
    expect(preview.recalled_tokens).toBe(1234);
    expect(preview.totals.chars).toBe(
      preview.totals.system_chars +
        preview.totals.tool_chars +
        preview.totals.message_chars
    );
  });

  it("orders tools heaviest first", async () => {
    // The list exists to be read top-down and stopped at: the first few entries
    // are the ones worth removing.
    const preview = await buildThreadPromptPreview({
      agent: fakeAgent({ instructions: "s", tools }),
      agentId: "engenty.copilot",
      memory: fakeMemory([]),
      modelId: null,
      resourceId: "user-1",
      threadId: "thread-1",
    });
    expect(preview.tools[0]?.name).toBe("requestDecision");
    expect(preview.tools[0]?.chars).toBeGreaterThan(
      preview.tools[1]?.chars ?? 0
    );
  });

  it("still reports the tool and system weight when recall fails", async () => {
    // A thread whose memory rows cannot be read is precisely when someone opens
    // this panel. Failing the whole preview would hide the two sections that do
    // not depend on memory at all.
    const memory = {
      recall: vi.fn(() => Promise.reject(new Error("db down"))),
    };
    const preview = await buildThreadPromptPreview({
      agent: fakeAgent({ instructions: "SYSTEM", tools }),
      agentId: "engenty.copilot",
      memory: memory as never,
      modelId: null,
      resourceId: "user-1",
      threadId: "thread-1",
    });
    expect(preview.messages).toEqual([]);
    expect(preview.system.chars).toBe("SYSTEM".length);
    expect(preview.tools).toHaveLength(2);
  });

  it("adds a caveat naming the tools whose schema it could not read", async () => {
    // An unread schema shows up as a suspiciously light tool. Without this the
    // reader concludes the tool section is cheap and goes pruning history.
    const preview = await buildThreadPromptPreview({
      agent: fakeAgent({
        instructions: "s",
        tools: { opaque: { description: "d", parameters: { weird: true } } },
      }),
      agentId: "engenty.copilot",
      memory: fakeMemory([]),
      modelId: null,
      resourceId: "user-1",
      threadId: "thread-1",
    });
    expect(preview.caveats.join(" ")).toContain("opaque");
    expect(preview.caveats.join(" ")).toContain("understated");
  });

  it("carries the caller's caveats through verbatim", async () => {
    // A breakdown that under-reports without saying so is worse than none: the
    // reader prunes history when the missing weight was elsewhere.
    const preview = await buildThreadPromptPreview({
      agent: fakeAgent({ instructions: "s", tools: {} }),
      agentId: "engenty.copilot",
      caveats: ["workspace tools are not attached"],
      memory: null,
      modelId: null,
      resourceId: "user-1",
      threadId: "thread-1",
    });
    expect(preview.caveats).toEqual(["workspace tools are not attached"]);
  });
});

describe("estimateTokens", () => {
  it("is a character ratio, and is labelled as an estimate everywhere it lands", () => {
    expect(estimateTokens(4000)).toBe(1000);
    expect(estimateTokens(0)).toBe(0);
  });
});
