import { describe, expect, it } from "vitest";
import { isSlimToolResult, slimThreadMessage } from "../slim-thread-message.js";

// Ways this can go wrong, and what each test below pins:
// - a reasoning part keeps its text → the page stays heavy
// - a generic tool step loses its name / args / state → the collapsed step
//   list cannot label itself
// - a result the collapsed UI reads is slimmed → a decision chooser, object
//   card, or approval disappears after reload
// - the placeholder does not say where the full row is → expanding cannot load it
// - text parts are touched → the conversation itself changes

const threadId = "00000000-0000-4000-8000-0000000000aa";
const messageId = "00000000-0000-4000-8000-0000000000bb";

const big = (label: string) => ({
  label,
  rows: Array.from({ length: 80 }, (_, i) => ({
    i,
    note: `row ${i} of a long listing`,
  })),
});

const toolPart = (
  toolName: string,
  result: unknown,
  extra: Record<string, unknown> = {}
) => ({
  type: "tool-invocation",
  toolInvocation: {
    args: { query: "open tasks" },
    result,
    state: "result",
    toolCallId: `call-${toolName}`,
    toolName,
    ...extra,
  },
});

const reasoningPart = {
  createdAt: 1,
  details: [{ text: "a long chain of thought ".repeat(200), type: "text" }],
  reasoning: "a long chain of thought ".repeat(200),
  type: "reasoning",
};

const row = (parts: unknown[]) => ({
  created_at: "2026-09-24T10:00:00.000000+00:00",
  id: messageId,
  metadata: { run_id: "run-1" },
  parts,
  role: "assistant",
  thread_id: threadId,
});

describe("slimThreadMessage", () => {
  it("drops reasoning text and flags the part and the row", () => {
    const slim = slimThreadMessage(row([reasoningPart]));
    const part = (slim.parts as Record<string, unknown>[])[0];
    expect(part).toMatchObject({
      details: [],
      reasoning: "",
      truncated: true,
      type: "reasoning",
    });
    expect(slim.metadata).toMatchObject({ run_id: "run-1", slim: true });
  });

  it("replaces a large generic result with a placeholder naming the full row", () => {
    const slim = slimThreadMessage(
      row([toolPart("engenty_tools_search", big("catalog"))])
    );
    const part = (slim.parts as Record<string, unknown>[])[0] as {
      toolInvocation: Record<string, unknown>;
      truncated?: boolean;
    };
    expect(part.truncated).toBe(true);
    expect(part.toolInvocation).toMatchObject({
      args: { query: "open tasks" },
      state: "result",
      toolCallId: "call-engenty_tools_search",
      toolName: "engenty_tools_search",
    });
    expect(isSlimToolResult(part.toolInvocation.result)).toBe(true);
    expect(part.toolInvocation.result).toMatchObject({
      message_id: messageId,
      thread_id: threadId,
    });
  });

  it("slims the dynamic-tool shape too", () => {
    const slim = slimThreadMessage(
      row([
        {
          input: { path: "notes.md" },
          output: big("file"),
          state: "output-available",
          toolCallId: "call-read",
          toolName: "mastra_workspace_read_file",
          type: "dynamic-tool",
        },
      ])
    );
    const part = (slim.parts as Record<string, unknown>[])[0];
    expect(isSlimToolResult(part.output)).toBe(true);
    expect(part.input).toEqual({ path: "notes.md" });
  });

  it.each([
    ["a decision tool", toolPart("requestDecision", big("choices"))],
    [
      "a wrapper naming a card tool",
      toolPart("engenty_tool_execute", big("objects"), {
        args: { id: "show_objects" },
      }),
    ],
    [
      "a result carrying a card marker",
      toolPart("engenty_tool_execute", {
        ...big("objects"),
        _meta: { engenty: { object_render: { refs: ["contact:1"] } } },
      }),
    ],
    [
      "an artifact result",
      toolPart("artifact_read", { ...big("doc"), artifact_id: "a1" }),
    ],
    [
      "a call parked on approval",
      toolPart("engenty_tool_execute", big("x"), {
        approval: { id: "ap-1" },
      }),
    ],
    [
      "a call still running",
      toolPart("engenty_tools_search", big("x"), { state: "call" }),
    ],
    ["a small result", toolPart("memory_note", { kept: true })],
  ])("keeps %s intact", (_label, part) => {
    const input = row([part]);
    expect(slimThreadMessage(input)).toEqual(input);
  });

  it("drops Mastra's suspension record from row metadata", () => {
    const input = {
      ...row([{ text: "Done.", type: "text" }]),
      metadata: {
        author_agent_id: "copilot",
        suspendedTools: { "call-1": { args: big("args"), type: "suspension" } },
      },
    };
    const slim = slimThreadMessage(input);
    expect(slim.metadata).toEqual({ author_agent_id: "copilot", slim: true });
    expect(slim.parts).toEqual(input.parts);
  });

  it("leaves text and user rows untouched", () => {
    const text = { text: "Here is the summary.", type: "text" };
    const slim = slimThreadMessage(row([reasoningPart, text]));
    expect((slim.parts as unknown[])[1]).toEqual(text);
    const user = { ...row([reasoningPart]), role: "user" };
    expect(slimThreadMessage(user)).toEqual(user);
  });

  it("makes a reasoning- and tool-heavy page several times smaller", () => {
    // Shape of the measured slow page: reasoning ~half the bytes, tool
    // results ~a quarter, prose the rest.
    const page = Array.from({ length: 20 }, (_, i) =>
      row([
        reasoningPart,
        toolPart("engenty_tool_execute", big(`exec-${i}`)),
        toolPart("navigate", { ok: true, to: "/s/me/copilot" }),
        { text: `Answer ${i}: `.padEnd(600, "."), type: "text" },
      ])
    );
    const full = JSON.stringify(page).length;
    const slim = JSON.stringify(page.map(slimThreadMessage)).length;
    expect(slim).toBeLessThan(full / 4);
  });
});
