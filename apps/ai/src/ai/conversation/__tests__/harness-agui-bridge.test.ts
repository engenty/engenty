import { describe, expect, it } from "vitest";
import {
  HarnessAgUiConverter,
  type HarnessEventLike,
} from "../harness-agui-bridge.js";

type Ev = Record<string, unknown> & { type: string };

function run(events: HarnessEventLike[]): Ev[] {
  const converter = new HarnessAgUiConverter();
  const out = events.flatMap((e) => converter.convert(e));
  out.push(...converter.finish());
  return out as unknown as Ev[];
}

function assistantMessage(
  id: string,
  text: string
): HarnessEventLike["message"] {
  return { content: [{ text, type: "text" }], id, role: "assistant" };
}

describe("HarnessAgUiConverter", () => {
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
      } as HarnessEventLike,
      {
        argsTextDelta: '"cats"}',
        toolCallId: "t1",
        type: "tool_input_delta",
      } as HarnessEventLike,
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

  it("attaches tool calls to the current assistant message id (not the toolCallId)", () => {
    // Mastra persists tool-invocations as PARTS of the assistant message; a tool
    // emitted under its own messageId is an orphan the client drops on finish (the
    // card vanishes). So once a message_* sets the id, tools must use it.
    const converter = new HarnessAgUiConverter();
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
    const converter = new HarnessAgUiConverter();
    converter.convert({ type: "usage_update", usage: { totalTokens: 10 } });
    converter.convert({ type: "usage_update", usage: { totalTokens: 42 } });
    expect(converter.lastUsage).toEqual({ totalTokens: 42 });
  });

  it("maps native subagent_* events to an agent-* tool card with nested progress", () => {
    const converter = new HarnessAgUiConverter();
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
});
