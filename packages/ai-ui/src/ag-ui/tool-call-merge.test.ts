import { describe, expect, it } from "vitest";
import { agUiMessagesToCopilotMessages } from "./copilot-adapter.js";
import {
  mergeDynamicToolPart,
  mergeDynamicToolPartsInOrder,
} from "./tool-call-merge.js";

describe("mergeDynamicToolPart", () => {
  it("keeps completed when a later error targets the same toolCallId", () => {
    const existing = {
      type: "dynamic-tool",
      toolCallId: "call-nav",
      toolName: "navigate",
      state: "output-available",
      input: { to: "/mdl/team" },
      output: { ok: true },
    };
    const incoming = {
      type: "dynamic-tool",
      toolCallId: "call-nav",
      toolName: "navigate",
      state: "output-error",
      input: {},
      errorText: "HTTP 400",
    };
    expect(mergeDynamicToolPart(existing, incoming).state).toBe(
      "output-available"
    );
  });

  it("allows server replace when error is superseded by completed", () => {
    const existing = {
      type: "dynamic-tool",
      toolCallId: "call-1",
      toolName: "tool",
      state: "output-error",
      errorText: "failed",
    };
    const incoming = {
      type: "dynamic-tool",
      toolCallId: "call-1",
      toolName: "tool",
      state: "output-available",
      output: { ok: true },
    };
    expect(mergeDynamicToolPart(existing, incoming).state).toBe(
      "output-available"
    );
  });

  it("collapses frontend dispatch id and Mastra wrapper id for the same navigate input", () => {
    const parts = mergeDynamicToolPartsInOrder([
      {
        type: "dynamic-tool",
        toolCallId: "ee1a9a8b-88e6-4db4-a6d8-555f42a10001",
        toolName: "navigate",
        state: "input-available",
        input: { to: "/mdl/contacts" },
      },
      {
        type: "dynamic-tool",
        toolCallId: "call_uDDwTkclkCCik6bjjFbbsAq5",
        toolName: "navigate",
        state: "output-available",
        input: { to: "/mdl/contacts" },
        output: { ok: true },
      },
    ]);
    expect(parts).toHaveLength(1);
    expect(parts[0]?.state).toBe("output-available");
    expect(parts[0]?.toolCallId).toBe("ee1a9a8b-88e6-4db4-a6d8-555f42a10001");
  });

  it("keeps progressLines when merging a completed row without logs", () => {
    const merged = mergeDynamicToolPart(
      {
        type: "dynamic-tool",
        toolCallId: "call_function_abc_1",
        toolName: "agent-engenty_tools",
        state: "input-available",
        input: { task: "pwd" },
        progressLines: ["$ pwd", "/workspace"],
      },
      {
        type: "dynamic-tool",
        toolCallId: "call_function_abc_1",
        toolName: "agent-engenty_tools",
        state: "output-available",
        input: { task: "pwd" },
        output: { summary: "Done." },
      }
    );
    expect(merged.progressLines).toEqual(["$ pwd", "/workspace"]);
    expect(merged.state).toBe("output-available");
  });

  it("collapses duplicate transcript parts to one row in order", () => {
    const parts = mergeDynamicToolPartsInOrder([
      {
        type: "dynamic-tool",
        toolCallId: "call-1",
        toolName: "navigate",
        state: "input-available",
        input: {},
      },
      {
        type: "dynamic-tool",
        toolCallId: "call-1",
        toolName: "navigate",
        state: "output-available",
        output: { ok: true },
      },
    ]);
    expect(parts).toHaveLength(1);
    expect(parts[0]?.state).toBe("output-available");
  });
});

describe("agUiMessagesToCopilotMessages tool merge", () => {
  it("renders one navigate row when dispatch id and Mastra wrapper id differ", () => {
    const messages = agUiMessagesToCopilotMessages([
      {
        id: "assistant-1",
        role: "assistant",
        content: "Done.",
        metadata: {
          transcript_parts: [
            {
              type: "dynamic-tool",
              toolCallId: "ee1a9a8b-88e6-4db4-a6d8-555f42a10001",
              toolName: "navigate",
              state: "input-available",
              input: { to: "/mdl/contacts" },
            },
            {
              type: "dynamic-tool",
              toolCallId: "call_uDDwTkclkCCik6bjjFbbsAq5",
              toolName: "navigate",
              state: "output-available",
              input: { to: "/mdl/contacts" },
              output: { ok: true },
            },
          ],
        },
      },
    ]);
    const toolParts =
      messages[0]?.parts?.filter(
        (part) =>
          typeof part === "object" &&
          part !== null &&
          (part as { type?: string }).type === "dynamic-tool"
      ) ?? [];
    expect(toolParts).toHaveLength(1);
    expect((toolParts[0] as { state?: string }).state).toBe("output-available");
  });

  it("renders one dynamic-tool part when transcript_parts duplicate toolCallId", () => {
    const messages = agUiMessagesToCopilotMessages([
      {
        id: "assistant-1",
        role: "assistant",
        content: "Done.",
        metadata: {
          transcript_parts: [
            {
              type: "dynamic-tool",
              toolCallId: "call-nav",
              toolName: "navigate",
              state: "output-available",
              input: { to: "/mdl/team" },
              output: { ok: true },
            },
            {
              type: "dynamic-tool",
              toolCallId: "call-nav",
              toolName: "navigate",
              state: "output-error",
              error: "stale",
            },
          ],
        },
      },
    ]);
    const toolParts =
      messages[0]?.parts?.filter(
        (part) =>
          typeof part === "object" &&
          part !== null &&
          (part as { type?: string }).type === "dynamic-tool"
      ) ?? [];
    expect(toolParts).toHaveLength(1);
    expect((toolParts[0] as { state?: string }).state).toBe("output-available");
  });
});
