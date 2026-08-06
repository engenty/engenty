import { describe, expect, it } from "vitest";
import {
  SessionAgUiConverter,
  type SessionEventLike,
} from "../session-agui-bridge.js";

type Ev = Record<string, unknown> & { type: string };

function run(events: SessionEventLike[]): Ev[] {
  const converter = new SessionAgUiConverter();
  const out = events.flatMap((e) => converter.convert(e));
  out.push(...converter.finish());
  return out as unknown as Ev[];
}

function assistantMessage(
  id: string,
  text: string
): SessionEventLike["message"] {
  return { content: [{ text, type: "text" }], id, role: "assistant" };
}

describe("SessionAgUiConverter", () => {
  it("diffs full message content into TEXT_MESSAGE_CONTENT deltas", () => {
    const out = run([
      { message: assistantMessage("m1", "Hel"), type: "message_update" },
      { message: assistantMessage("m1", "Hello"), type: "message_update" },
      { message: assistantMessage("m1", "Hello world"), type: "message_end" },
    ]);
    expect(out.map((e) => e.type)).toEqual([
      "TEXT_MESSAGE_START",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_END",
    ]);
    const deltas = out
      .filter((e) => e.type === "TEXT_MESSAGE_CONTENT")
      .map((e) => e.delta);
    expect(deltas).toEqual(["Hel", "lo", " world"]);
  });

  it("ignores user/system messages and re-emits nothing when text is unchanged", () => {
    const out = run([
      {
        message: {
          content: [{ text: "hi", type: "text" }],
          id: "u1",
          role: "user",
        },
        type: "message_update",
      },
      { message: assistantMessage("m1", "done"), type: "message_update" },
      { message: assistantMessage("m1", "done"), type: "message_end" },
    ]);
    expect(out.map((e) => e.type)).toEqual([
      "TEXT_MESSAGE_START",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_END",
    ]);
  });

  it("maps streamed tool input + result to a well-formed tool call", () => {
    const out = run([
      { toolCallId: "t1", toolName: "search", type: "tool_input_start" },
      {
        argsTextDelta: '{"q":',
        toolCallId: "t1",
        type: "tool_input_delta",
      } as SessionEventLike,
      {
        argsTextDelta: '"cats"}',
        toolCallId: "t1",
        type: "tool_input_delta",
      } as SessionEventLike,
      { toolCallId: "t1", type: "tool_input_end" },
      {
        isError: false,
        result: { hits: 3 },
        toolCallId: "t1",
        type: "tool_end",
      },
    ]);
    expect(out.map((e) => e.type)).toEqual([
      "TOOL_CALL_START",
      "TOOL_CALL_ARGS",
      "TOOL_CALL_ARGS",
      "TOOL_CALL_END",
      "TOOL_CALL_END",
      "TOOL_CALL_RESULT",
    ]);
    const result = out.find((e) => e.type === "TOOL_CALL_RESULT");
    expect(result?.content).toContain("hits");
    expect(result?.toolCallId).toBe("t1");
  });

  it("handles a tool_start that carries full args without streaming", () => {
    const out = run([
      {
        args: { q: "x" },
        toolCallId: "t2",
        toolName: "lookup",
        type: "tool_start",
      },
      { result: "ok", toolCallId: "t2", type: "tool_end" },
    ]);
    const types = out.map((e) => e.type);
    expect(types[0]).toBe("TOOL_CALL_START");
    expect(types).toContain("TOOL_CALL_ARGS");
    expect(types).toContain("TOOL_CALL_RESULT");
    // Only one START even though tool_start fired once.
    expect(types.filter((t) => t === "TOOL_CALL_START")).toHaveLength(1);
  });

  it("does not re-append full args when tool_start follows streamed deltas", () => {
    // Mastra emits tool_input_* deltas, then a tool_start with the complete
    // args object. Re-appending that object produced concatenated JSON in the
    // inspector (two identical objects with no separator).
    const out = run([
      {
        toolCallId: "t-dup",
        toolName: "engenty_tool_execute",
        type: "tool_input_start",
      },
      {
        argsTextDelta:
          '{"id":"contacts_create","input":{"display_name":"WAFF"}}',
        toolCallId: "t-dup",
        type: "tool_input_delta",
      } as SessionEventLike,
      { toolCallId: "t-dup", type: "tool_input_end" },
      {
        args: {
          id: "contacts_create",
          input: { display_name: "WAFF" },
        },
        toolCallId: "t-dup",
        toolName: "engenty_tool_execute",
        type: "tool_start",
      },
      { result: "ok", toolCallId: "t-dup", type: "tool_end" },
    ]);
    const argDeltas = out
      .filter((e) => e.type === "TOOL_CALL_ARGS")
      .map((e) => e.delta);
    expect(argDeltas).toEqual([
      '{"id":"contacts_create","input":{"display_name":"WAFF"}}',
    ]);
  });

  it("holds a nameless tool_input_start so the named tool_start opens the call", () => {
    // Azure surfaces dynamic tools' input-streaming-start before the tool
    // name; Mastra passes that through as toolName "". Opening the call on the
    // nameless event froze "" into the transcript — the named tool_start that
    // followed was deduped, and every workspace_action row rendered as the
    // UI's "Ran tool" placeholder.
    const out = run([
      { toolCallId: "t9", toolName: "", type: "tool_input_start" },
      {
        argsTextDelta: '{"op":"write"}',
        toolCallId: "t9",
        type: "tool_input_delta",
      } as SessionEventLike,
      {
        args: { op: "write" },
        toolCallId: "t9",
        toolName: "workspace_action",
        type: "tool_start",
      },
      { result: "ok", toolCallId: "t9", type: "tool_end" },
    ]);
    const starts = out.filter((e) => e.type === "TOOL_CALL_START");
    expect(starts).toHaveLength(1);
    expect(starts[0]?.toolCallName).toBe("workspace_action");
  });

  it("still opens a genuinely nameless tool_start so END/RESULT pair up", () => {
    const out = run([
      { args: {}, toolCallId: "t10", toolName: "", type: "tool_start" },
      { result: "ok", toolCallId: "t10", type: "tool_end" },
    ]);
    const start = out.find((e) => e.type === "TOOL_CALL_START");
    expect(start?.toolCallName).toBe("tool");
    expect(out.map((e) => e.type)).toContain("TOOL_CALL_RESULT");
  });

  it("attaches tool calls to the current assistant message id (not the toolCallId)", () => {
    // Mastra persists tool-invocations as PARTS of the assistant message; a tool
    // emitted under its own messageId is an orphan the client drops on finish (the
    // card vanishes). So once a message_* sets the id, tools must use it.
    const converter = new SessionAgUiConverter();
    converter.convert({
      message: assistantMessage("m1", "calling a tool"),
      type: "message_update",
    });
    const toolEvents = [
      { toolCallId: "t1", toolName: "load_team", type: "tool_input_start" },
      { toolCallId: "t1", type: "tool_input_end" },
      { result: "4", toolCallId: "t1", type: "tool_end" },
    ].flatMap((e) => converter.convert(e as never)) as unknown as Ev[];
    // Every tool event carries the assistant message id m1, not "t1".
    for (const e of toolEvents) {
      expect(e.messageId).toBe("m1");
    }
  });

  it("captures the latest usage_update for recording", () => {
    const converter = new SessionAgUiConverter();
    converter.convert({ type: "usage_update", usage: { totalTokens: 10 } });
    converter.convert({ type: "usage_update", usage: { totalTokens: 42 } });
    expect(converter.lastUsage).toEqual({ totalTokens: 42 });
  });

  it("maps native subagent_* events to an agent-* tool card with nested progress", () => {
    const converter = new SessionAgUiConverter();
    const out = [
      {
        agentType: "research",
        task: "find X",
        toolCallId: "s1",
        type: "subagent_start",
      },
      { textDelta: "looking…", toolCallId: "s1", type: "subagent_text_delta" },
      {
        subToolName: "web_search",
        toolCallId: "s1",
        type: "subagent_tool_start",
      },
      {
        isError: false,
        result: "found X",
        toolCallId: "s1",
        type: "subagent_end",
      },
    ].flatMap((e) => converter.convert(e as never)) as unknown as Ev[];

    const start = out.find((e) => e.type === "TOOL_CALL_START");
    expect(start?.toolCallName).toBe("agent-research"); // routes to the sub-agent card
    const progress = out.filter((e) => e.type === "CUSTOM");
    expect(progress.map((e) => (e.value as { line?: string }).line)).toEqual([
      "looking…",
      "Running web_search",
    ]);
    const result = out.find((e) => e.type === "TOOL_CALL_RESULT");
    expect(result?.content).toContain("found X");
    // Lines accumulated for post-run persistence.
    expect(converter.getSubAgentProgressLines().get("s1")).toEqual([
      "looking…",
      "Running web_search",
    ]);
  });

  it("closes a dangling text message on finish", () => {
    const out = run([
      { message: assistantMessage("m1", "partial"), type: "message_update" },
      // no message_end — run ended mid-text
    ]);
    expect(out.map((e) => e.type)).toEqual([
      "TEXT_MESSAGE_START",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_END",
    ]);
  });

  it("reads assistant text from MastraDBMessage content.parts", () => {
    const out = run([
      {
        message: {
          content: {
            format: 2,
            parts: [{ type: "text", text: "Hello from parts" }],
          },
          id: "m1",
          role: "assistant",
        },
        type: "message_update",
      },
      {
        message: {
          content: {
            format: 2,
            parts: [{ type: "text", text: "Hello from parts!" }],
          },
          id: "m1",
          role: "assistant",
        },
        type: "message_end",
      },
    ]);
    expect(out.map((e) => e.type)).toEqual([
      "TEXT_MESSAGE_START",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_END",
    ]);
    const deltas = out
      .filter((e) => e.type === "TEXT_MESSAGE_CONTENT")
      .map((e) => e.delta);
    expect(deltas).toEqual(["Hello from parts", "!"]);
  });
});

// A hallucinated tool name never dispatches, so Mastra emits START/ARGS/END and
// then nothing — the run ends with the call unanswered. The converter has to
// surface those so the executor can answer them; otherwise the chat card spins
// forever and the model is never told its tool does not exist.
describe("SessionAgUiConverter unresolved tool calls", () => {
  it("reports a call that never received a tool_end", () => {
    const converter = new SessionAgUiConverter();
    converter.convert({
      message: { content: [], id: "m1", role: "assistant" },
      type: "message_update",
    });
    converter.convert({
      args: { question: "Which provider?" },
      toolCallId: "call_1",
      toolName: "ask_user",
      type: "tool_start",
    });

    expect(converter.getUnresolvedToolCalls()).toEqual([
      { toolCallId: "call_1", toolName: "ask_user" },
    ]);
  });

  it("does not report calls that completed or suspended", () => {
    const converter = new SessionAgUiConverter();
    converter.convert({
      toolCallId: "done",
      toolName: "engenty_tools_search",
      type: "tool_start",
    });
    converter.convert({
      result: { ok: true },
      toolCallId: "done",
      type: "tool_end",
    });
    // A parked frontend tool / approval gate is legitimately resultless: the
    // resume completes it. Reporting it would fail an interrupt the user is
    // still looking at.
    converter.convert({
      toolCallId: "parked",
      toolName: "navigate",
      type: "tool_start",
    });
    converter.convert({ toolCallId: "parked", type: "tool_suspended" });

    expect(converter.getUnresolvedToolCalls()).toEqual([]);
  });

  it("reports nameless calls under the placeholder name it opened them with", () => {
    const converter = new SessionAgUiConverter();
    converter.convert({ toolCallId: "c1", toolName: "", type: "tool_start" });

    expect(converter.getUnresolvedToolCalls()).toEqual([
      { toolCallId: "c1", toolName: "tool" },
    ]);
  });
});

describe("closeUnresolvedToolCalls", () => {
  it("closes a dangling call with END then an unknown_tool RESULT", () => {
    const converter = new SessionAgUiConverter();
    converter.convert({
      message: { content: [], id: "m1", role: "assistant" },
      type: "message_update",
    });
    converter.convert({
      toolCallId: "call_1",
      toolName: "ask_user",
      type: "tool_start",
    });

    const out = converter.closeUnresolvedToolCalls({
      knownToolNames: ["requestDecision"],
    }) as unknown as Ev[];

    expect(out.map((e) => e.type)).toEqual([
      "TOOL_CALL_END",
      "TOOL_CALL_RESULT",
    ]);
    // The card must attach to the assistant message, like every other tool row.
    expect(out[1]?.messageId).toBe("m1");
    expect(JSON.parse(String(out[1]?.content))).toMatchObject({
      code: "unknown_tool",
      ok: false,
      tool_name: "ask_user",
    });
    // Idempotent: a second call has nothing left to close.
    expect(converter.closeUnresolvedToolCalls()).toEqual([]);
  });

  it("closes nothing when every call completed or parked", () => {
    const converter = new SessionAgUiConverter();
    converter.convert({
      toolCallId: "a",
      toolName: "navigate",
      type: "tool_start",
    });
    converter.convert({ toolCallId: "a", type: "tool_suspended" });

    expect(converter.closeUnresolvedToolCalls()).toEqual([]);
  });
});
