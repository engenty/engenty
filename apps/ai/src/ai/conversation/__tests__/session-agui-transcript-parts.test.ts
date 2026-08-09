import { describe, expect, it } from "vitest";
import {
  SessionAgUiConverter,
  type SessionEventLike,
} from "../session-agui-bridge.js";

type Ev = Record<string, unknown> & { type: string };

function convert(events: SessionEventLike[]): {
  out: Ev[];
  parts: readonly unknown[];
} {
  const converter = new SessionAgUiConverter();
  const out = events.flatMap((e) => converter.convert(e));
  out.push(...converter.finish());
  return { out: out as unknown as Ev[], parts: converter.getTranscriptParts() };
}

function assistantMessage(id: string, text: string) {
  return { content: [{ text, type: "text" }], id, role: "assistant" };
}

const DECISION_ARTIFACT = {
  artifact_id: "a1",
  artifact_type: "decision" as const,
  body: "Die Zeiterfassung (234 Einträge) ist abgeschlossen.",
  choices: [
    { id: "report", label: "Report erstellen" },
    { id: "invoice", label: "Rechnungen erstellen" },
  ],
  interrupt_id: "a1",
  title: "Nächster Schritt",
};

describe("nameless tool_input_start does not orphan its args deltas", () => {
  it("holds the deltas until the named start, then flushes them all in order", () => {
    // Azure-style: input-start arrives before the provider surfaces the name.
    const { out } = convert([
      { toolCallId: "c1", type: "tool_input_start" },
      {
        argsTextDelta: '{"title":"Nä',
        toolCallId: "c1",
        type: "tool_input_delta",
      },
      {
        argsTextDelta: 'chster Schritt"}',
        toolCallId: "c1",
        type: "tool_input_delta",
      },
      { toolCallId: "c1", toolName: "requestDecision", type: "tool_start" },
    ]);

    // The START must come first — args for a call the client has never been
    // told about are dropped, which is what left a nameless "tool" card holding
    // only the TAIL of the JSON.
    expect(out.map((e) => e.type)).toEqual([
      "TOOL_CALL_START",
      "TOOL_CALL_ARGS",
      "TOOL_CALL_ARGS",
    ]);
    expect(out[0]?.toolCallName).toBe("requestDecision");

    const args = out
      .filter((e) => e.type === "TOOL_CALL_ARGS")
      .map((e) => e.delta)
      .join("");
    expect(args).toBe('{"title":"Nächster Schritt"}');
    expect(JSON.parse(args)).toEqual({ title: "Nächster Schritt" });
  });

  it("does not append the full args on top of already-streamed deltas", () => {
    const { out } = convert([
      { toolCallId: "c1", type: "tool_input_start" },
      { argsTextDelta: '{"a":1}', toolCallId: "c1", type: "tool_input_delta" },
      {
        args: { a: 1 },
        toolCallId: "c1",
        toolName: "requestDecision",
        type: "tool_start",
      },
    ]);
    const args = out
      .filter((e) => e.type === "TOOL_CALL_ARGS")
      .map((e) => e.delta)
      .join("");
    expect(args).toBe('{"a":1}');
  });

  it("still streams deltas immediately for a call that opened normally", () => {
    const { out } = convert([
      { toolCallId: "c1", toolName: "search", type: "tool_input_start" },
      {
        argsTextDelta: '{"q":"x"}',
        toolCallId: "c1",
        type: "tool_input_delta",
      },
    ]);
    expect(out.map((e) => e.type)).toEqual([
      "TOOL_CALL_START",
      "TOOL_CALL_ARGS",
    ]);
  });
});

describe("transcript parts accumulate for the durable write", () => {
  it("captures assistant text", () => {
    const { parts } = convert([
      { message: assistantMessage("m1", "Hallo"), type: "message_update" },
      { message: assistantMessage("m1", "Hallo Welt"), type: "message_end" },
    ]);
    expect(parts).toEqual([{ text: "Hallo Welt", type: "text" }]);
  });

  it("captures a requestDecision artifact — the interrupt the run aborts on", () => {
    // This is the case that used to persist NOTHING: the artifact arrives as a
    // tool result and the executor aborts the run, so memory never flushes.
    const { parts } = convert([
      { message: assistantMessage("m1", "Fertig."), type: "message_update" },
      {
        args: { title: "Nächster Schritt" },
        toolCallId: "c1",
        toolName: "requestDecision",
        type: "tool_start",
      },
      { result: DECISION_ARTIFACT, toolCallId: "c1", type: "tool_end" },
    ]);

    expect(parts[0]).toEqual({ text: "Fertig.", type: "text" });
    const toolPart = parts[1] as {
      output?: { artifact_type?: string; title?: string };
      toolCallId?: string;
      toolName?: string;
      type?: string;
    };
    expect(toolPart.type).toBe("dynamic-tool");
    expect(toolPart.toolName).toBe("requestDecision");
    expect(toolPart.toolCallId).toBe("c1");
    expect(toolPart.output?.artifact_type).toBe("decision");
    // One part per call — the running part is replaced, not duplicated.
    expect(parts).toHaveLength(2);
  });

  it("keeps whitespace inside streamed args verbatim", () => {
    const { out } = convert([
      { toolCallId: "c1", type: "tool_input_start" },
      {
        argsTextDelta: '{"b":"Die',
        toolCallId: "c1",
        type: "tool_input_delta",
      },
      {
        argsTextDelta: ' Zeiterfassung (234 Einträge)"}',
        toolCallId: "c1",
        type: "tool_input_delta",
      },
      { toolCallId: "c1", toolName: "requestDecision", type: "tool_start" },
    ]);
    const args = out
      .filter((e) => e.type === "TOOL_CALL_ARGS")
      .map((e) => e.delta)
      .join("");
    expect(JSON.parse(args).b).toBe("Die Zeiterfassung (234 Einträge)");
  });
});

describe("recordToolResultPart (artifact intercepted before the converter)", () => {
  it("settles the durable part without emitting anything on the wire", () => {
    const converter = new SessionAgUiConverter();
    const out = [
      ...converter.convert({
        toolCallId: "c1",
        toolName: "requestDecision",
        type: "tool_input_start",
      }),
    ];
    // The executor intercepts this tool_end, records the part, and aborts.
    converter.recordToolResultPart({
      result: DECISION_ARTIFACT,
      toolCallId: "c1",
      toolName: "requestDecision",
    });

    // Wire is untouched — the interactive interrupt replaces the plain result.
    expect(out.map((e) => (e as Ev).type)).toEqual(["TOOL_CALL_START"]);

    const part = converter.getTranscriptParts()[0] as {
      output?: { artifact_type?: string; choices?: unknown[] };
      state?: string;
      toolName?: string;
    };
    expect(part.toolName).toBe("requestDecision");
    expect(part.state).not.toBe("input-streaming");
    expect(part.output?.artifact_type).toBe("decision");
    expect(part.output?.choices).toHaveLength(2);
  });

  it("falls back to the recorded tool name and args", () => {
    const converter = new SessionAgUiConverter();
    converter.convert({
      args: { title: "T" },
      toolCallId: "c1",
      toolName: "requestDecision",
      type: "tool_start",
    });
    converter.recordToolResultPart({
      result: DECISION_ARTIFACT,
      toolCallId: "c1",
    });
    const part = converter.getTranscriptParts()[0] as { toolName?: string };
    expect(part.toolName).toBe("requestDecision");
    expect(converter.getTranscriptParts()).toHaveLength(1);
  });

  it("ignores a call with no id", () => {
    const converter = new SessionAgUiConverter();
    converter.recordToolResultPart({
      result: DECISION_ARTIFACT,
      toolCallId: "",
    });
    expect(converter.getTranscriptParts()).toHaveLength(0);
  });
});

describe("persisted tool parts always carry defined args", () => {
  // Regression: parts written with no `input` replay as tool_calls with no
  // function.arguments, and the provider rejects the whole request —
  // "<400> InternalError.Algo.InvalidParameter: If tool_calls are present in
  // the message, function.arguments must be defined." The thread is then
  // permanently stuck: every later turn resends the same poisoned history.
  function toolParts(events: SessionEventLike[]) {
    const converter = new SessionAgUiConverter();
    for (const event of events) {
      converter.convert(event);
    }
    return converter
      .getTranscriptParts()
      .filter(
        (part) => (part as { type?: string }).type === "dynamic-tool"
      ) as Array<{ input?: unknown; toolName?: string }>;
  }

  it("captures STREAMED args — the common case that had no input at all", () => {
    const parts = toolParts([
      {
        toolCallId: "c1",
        toolName: "engenty_tools_search",
        type: "tool_input_start",
      },
      {
        argsTextDelta: '{"query":"time',
        toolCallId: "c1",
        type: "tool_input_delta",
      },
      {
        argsTextDelta: ' tracking"}',
        toolCallId: "c1",
        type: "tool_input_delta",
      },
      { toolCallId: "c1", type: "tool_input_end" },
    ]);

    expect(parts).toHaveLength(1);
    expect(parts[0]?.input).toEqual({ query: "time tracking" });
  });

  it("never leaves input undefined, even with no args at all", () => {
    const parts = toolParts([
      { toolCallId: "c1", toolName: "noop", type: "tool_start" },
    ]);
    expect(parts[0]).toHaveProperty("input");
    expect(parts[0]?.input).toEqual({});
  });

  it("keeps input defined on the settled result part", () => {
    const parts = toolParts([
      {
        toolCallId: "c1",
        toolName: "engenty_tools_search",
        type: "tool_input_start",
      },
      { argsTextDelta: '{"q":1}', toolCallId: "c1", type: "tool_input_delta" },
      { toolCallId: "c1", type: "tool_input_end" },
      { result: { ok: true }, toolCallId: "c1", type: "tool_end" },
    ]);
    expect(parts[0]?.input).toEqual({ q: 1 });
  });

  it("keeps malformed streamed args rather than dropping them", () => {
    const parts = toolParts([
      { toolCallId: "c1", toolName: "x", type: "tool_input_start" },
      { argsTextDelta: '{"q":', toolCallId: "c1", type: "tool_input_delta" },
      { toolCallId: "c1", type: "tool_input_end" },
    ]);
    expect(parts[0]?.input).toBe('{"q":');
  });

  it("survives JSON.stringify with the input key intact", () => {
    const parts = toolParts([
      { toolCallId: "c1", toolName: "noop", type: "tool_start" },
    ]);
    // `input: undefined` vanishes through JSON — this is what reached the DB.
    expect(JSON.parse(JSON.stringify(parts[0]))).toHaveProperty("input");
  });
});

describe("decision artifact parts also carry defined args", () => {
  it("gives the requestDecision part an input even though the artifact branch ignores args", () => {
    // toolResultPayloadToAssistantDynamicToolPart renders a decision artifact
    // from the artifact alone and never sets `input`. Persisting that shape
    // poisoned the thread with the provider's 400.
    const converter = new SessionAgUiConverter();
    converter.convert({
      toolCallId: "c1",
      toolName: "requestDecision",
      type: "tool_input_start",
    });
    converter.convert({
      argsTextDelta: '{"title":"Nächster Schritt"}',
      toolCallId: "c1",
      type: "tool_input_delta",
    });
    converter.recordToolResultPart({
      result: DECISION_ARTIFACT,
      toolCallId: "c1",
      toolName: "requestDecision",
    });

    const part = converter.getTranscriptParts()[0] as { input?: unknown };
    expect(part).toHaveProperty("input");
    expect(part.input).toEqual({ title: "Nächster Schritt" });
    expect(JSON.parse(JSON.stringify(part))).toHaveProperty("input");
  });
});
