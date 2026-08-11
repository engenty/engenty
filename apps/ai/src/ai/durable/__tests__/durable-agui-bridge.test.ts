import { describe, expect, it } from "vitest";
import { DurableAgUiConverter } from "../durable-agui-bridge.js";

type Ev = Record<string, unknown> & { type: string };

function run(
  chunks: Array<{ payload?: Record<string, unknown>; type: string }>
): Ev[] {
  const converter = new DurableAgUiConverter();
  const events = chunks.flatMap((c) => converter.convert(c));
  events.push(...converter.finish());
  return events as unknown as Ev[];
}

describe("DurableAgUiConverter", () => {
  it("maps a text message to START / CONTENT / END", () => {
    const events = run([
      { payload: { id: "m1" }, type: "text-start" },
      { payload: { text: "Hel" }, type: "text-delta" },
      { payload: { text: "lo" }, type: "text-delta" },
      { type: "text-end" },
    ]);
    expect(events.map((e) => e.type)).toEqual([
      "TEXT_MESSAGE_START",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_END",
    ]);
    expect((events[0] as unknown as { messageId: string }).messageId).toBe(
      "m1"
    );
    expect((events[1] as unknown as { delta: string }).delta).toBe("Hel");
  });

  it("auto-opens a text message if a delta arrives before text-start", () => {
    const events = run([{ payload: { text: "hi" }, type: "text-delta" }]);
    expect(events[0]?.type).toBe("TEXT_MESSAGE_START");
    expect(events[1]?.type).toBe("TEXT_MESSAGE_CONTENT");
    expect(events.at(-1)?.type).toBe("TEXT_MESSAGE_END"); // flushed by finish()
  });

  it("maps a tool call to START / ARGS / END and ends open text", () => {
    const events = run([
      { payload: { id: "m1" }, type: "text-start" },
      {
        payload: { args: { q: "x" }, toolCallId: "t1", toolName: "search" },
        type: "tool-call",
      },
    ]);
    expect(events.map((e) => e.type)).toEqual([
      "TEXT_MESSAGE_START",
      "TEXT_MESSAGE_END", // tool call interrupts open text
      "TOOL_CALL_START",
      "TOOL_CALL_ARGS",
      "TOOL_CALL_END",
    ]);
    const start = events[2] as unknown as {
      toolCallId: string;
      toolCallName: string;
    };
    expect(start.toolCallId).toBe("t1");
    expect(start.toolCallName).toBe("search");
    expect((events[3] as unknown as { delta: string }).delta).toBe('{"q":"x"}');
  });

  it("does not re-emit START for the same tool call id", () => {
    const events = run([
      { payload: { toolCallId: "t1", toolName: "x" }, type: "tool-call" },
      {
        payload: { toolCallId: "t1", toolName: "x" },
        type: "tool-execution-start",
      },
    ]);
    expect(events.filter((e) => e.type === "TOOL_CALL_START")).toHaveLength(1);
  });

  it("maps tool-result and tool-output to TOOL_CALL_RESULT", () => {
    const result = run([
      {
        payload: { result: { sum: 42 }, toolCallId: "t1" },
        type: "tool-result",
      },
    ]);
    const output = run([
      { payload: { output: "done", toolCallId: "t2" }, type: "tool-output" },
    ]);
    expect(result[0]?.type).toBe("TOOL_CALL_RESULT");
    expect((result[0] as unknown as { content: string }).content).toBe(
      '{"sum":42}'
    );
    expect(output[0]?.type).toBe("TOOL_CALL_RESULT");
    expect((output[0] as unknown as { content: string }).content).toBe("done");
  });

  it("ignores unknown chunk types", () => {
    expect(
      run([{ type: "response-metadata" }, { type: "step-finish" }])
    ).toEqual([]);
  });

  it("separates the billed total from the window occupancy", () => {
    // `finish` carries the sum across steps (what the run costs); each
    // `step-finish` carries one step's own prompt (how full the window got).
    // Reading the sum as occupancy reported a three-step turn as ~3× the
    // context it filled.
    const converter = new DurableAgUiConverter();
    converter.convert({
      payload: { output: { usage: { inputTokens: 30_000 } } },
      type: "step-finish",
    });
    converter.convert({
      payload: { output: { usage: { inputTokens: 33_000 } } },
      type: "step-finish",
    });
    converter.convert({
      payload: { usage: { inputTokens: 63_000, outputTokens: 300 } },
      type: "finish",
    });

    expect(converter.totalUsage).toMatchObject({ inputTokens: 63_000 });
    expect(converter.lastUsage).toMatchObject({ inputTokens: 33_000 });
  });

  it("falls back to the run aggregate when no step usage arrived", () => {
    const converter = new DurableAgUiConverter();
    converter.convert({
      payload: { usage: { inputTokens: 12_000 } },
      type: "finish",
    });

    expect(converter.lastUsage).toMatchObject({ inputTokens: 12_000 });
  });

  it("emits CUSTOM sub_agent.progress for nested agent-execution-event chunks", () => {
    const events = run([
      // A sub-agent delegation tool call (`agent-*`) opens the delegation.
      {
        payload: {
          args: {},
          toolCallId: "deleg1",
          toolName: "agent-engenty_cli",
        },
        type: "tool-call",
      },
      // Nested progress streamed from the sub-agent.
      {
        payload: { text: "Running echo_hello.sh" },
        type: "agent-execution-event-progress",
      },
    ]);
    const custom = events.find((e) => e.type === "CUSTOM") as
      | { name?: string; value?: { line?: string; toolCallId?: string } }
      | undefined;
    expect(custom?.name).toBe("engenty.sub_agent.progress");
    expect(custom?.value?.line).toBe("Running echo_hello.sh");
    // Progress attaches to the delegation tool call.
    expect(custom?.value?.toolCallId).toBe("deleg1");
  });

  it("accumulates sub-agent progress lines per delegation for persistence", () => {
    // The executor folds these onto the saved tool part (Mastra memory drops the
    // app-level lines), so the converter must accumulate them, not just emit.
    const converter = new DurableAgUiConverter();
    for (const chunk of [
      {
        payload: { toolCallId: "deleg1", toolName: "agent-engenty_cli" },
        type: "tool-call",
      },
      {
        payload: { text: "Running ls" },
        type: "agent-execution-event-progress",
      },
      { payload: { text: "Done" }, type: "agent-execution-event-output" },
    ]) {
      converter.convert(chunk);
    }
    const progress = converter.getSubAgentProgressLines();
    expect(progress.get("deleg1")).toEqual(["Running ls", "Done"]);
  });

  it("does not emit progress without an active delegation, and stops after finalize", () => {
    // No delegation in flight → progress is dropped.
    const orphan = run([
      { payload: { text: "stray" }, type: "agent-execution-event-progress" },
    ]);
    expect(orphan.some((e) => e.type === "CUSTOM")).toBe(false);

    // After the delegation finalizes, later progress no longer attaches.
    const finalized = run([
      {
        payload: { toolCallId: "d2", toolName: "agent-engenty_cli" },
        type: "tool-call",
      },
      { payload: {}, type: "agent-execution-event-completed" },
      { payload: { text: "late" }, type: "agent-execution-event-progress" },
    ]);
    expect(finalized.some((e) => e.type === "CUSTOM")).toBe(false);
  });

  it("does not treat a normal tool call as a sub-agent delegation", () => {
    const events = run([
      {
        payload: { toolCallId: "t1", toolName: "list_tasks" },
        type: "tool-call",
      },
      { payload: { text: "x" }, type: "agent-execution-event-progress" },
    ]);
    expect(events.some((e) => e.type === "CUSTOM")).toBe(false);
  });
});
