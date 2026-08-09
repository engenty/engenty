import type { AGUIEvent } from "@engenty/ag-ui-bridge";
import { describe, expect, it } from "vitest";
import {
  buildToolCallNameIndex,
  buildToolCallTree,
  eventFullText,
  eventIdentifiers,
  eventSummary,
  foldStreamedDeltas,
} from "./ag-ui-inspector-model.js";

const CALL_ID = "call_891523deb2504079a1ff4d81";

const events = [
  {
    messageId: "3fc33d86-527f-4d74-a8d0-3a66fce9eb80",
    toolCallId: CALL_ID,
    toolCallName: "engenty_tools_search",
    type: "TOOL_CALL_START",
  },
  {
    delta: '{"question":"Welchen  E-Mail-Anbieter…"}',
    toolCallId: CALL_ID,
    type: "TOOL_CALL_ARGS",
  },
  { toolCallId: CALL_ID, type: "TOOL_CALL_END" },
  {
    content: '{"ok":true,"data":{"accounts":[]}}',
    messageId: "3fc33d86-527f-4d74-a8d0-3a66fce9eb80",
    toolCallId: CALL_ID,
    type: "TOOL_CALL_RESULT",
  },
] as unknown as AGUIEvent[];

// Only TOOL_CALL_START carries toolCallName on the wire; without the index the
// ARGS/END/RESULT rows degrade to bare UUIDs — which is exactly the stream-tab
// regression this pins against.
describe("inspector event summaries", () => {
  const names = buildToolCallNameIndex(events);

  it("indexes tool names by call id", () => {
    expect(names.get(CALL_ID)).toBe("engenty_tools_search");
  });

  it("labels every row of a tool call with its name and short id", () => {
    expect(eventSummary(events[0]!, names)).toBe(
      "engenty_tools_search · #ff4d81"
    );
    expect(eventSummary(events[2]!, names)).toBe(
      "engenty_tools_search · #ff4d81"
    );
  });

  it("previews args and result payloads inline", () => {
    expect(eventSummary(events[1]!, names)).toBe(
      'engenty_tools_search · #ff4d81 · {"question":"Welchen E-Mail-Anbieter…"}'
    );
    expect(eventSummary(events[3]!, names)).toBe(
      'engenty_tools_search · #ff4d81 · {"ok":true,"data":{"accounts":[]}}'
    );
  });

  it("falls back to a generic label when the start event was never seen", () => {
    expect(eventSummary(events[1]!, new Map())).toBe(
      'tool · #ff4d81 · {"question":"Welchen E-Mail-Anbieter…"}'
    );
  });

  it("labels a payload-less event by type instead of by id", () => {
    // Previously summarised as the bare runId. An id says nothing at a glance,
    // and a column of UUIDs is the stream at its least readable; ids now live on
    // the muted line of the expanded row (eventIdentifiers).
    expect(
      eventSummary({
        runId: "run-1",
        type: "RUN_FINISHED",
      } as unknown as AGUIEvent)
    ).toBe("RUN_FINISHED");
  });
});

describe("buildToolCallTree args accumulation", () => {
  const CALL = "call_decision_1";

  it("keeps whitespace between streamed args deltas", () => {
    // readString() trims, which silently destroyed the spaces BETWEEN chunks:
    // "Die Zeiterfassung (234 Einträge" rendered as "DieZeiterfassung(234Einträge"
    // and read exactly like a model or streaming bug.
    const tree = buildToolCallTree([
      {
        toolCallId: CALL,
        toolCallName: "requestDecision",
        type: "TOOL_CALL_START",
      },
      { delta: '{"body":"Die', toolCallId: CALL, type: "TOOL_CALL_ARGS" },
      {
        delta: " Zeiterfassung (234 Einträge)",
        toolCallId: CALL,
        type: "TOOL_CALL_ARGS",
      },
      { delta: '"}', toolCallId: CALL, type: "TOOL_CALL_ARGS" },
    ] as unknown as AGUIEvent[]);

    const call = tree.find((entry) => entry.id === CALL);
    expect(call?.args).toBe('{"body":"Die Zeiterfassung (234 Einträge)"}');
    expect(JSON.parse(call?.args ?? "{}").body).toBe(
      "Die Zeiterfassung (234 Einträge)"
    );
  });

  it("preserves a whitespace-only delta", () => {
    const tree = buildToolCallTree([
      { toolCallId: CALL, toolCallName: "x", type: "TOOL_CALL_START" },
      { delta: '{"a":"b', toolCallId: CALL, type: "TOOL_CALL_ARGS" },
      { delta: " ", toolCallId: CALL, type: "TOOL_CALL_ARGS" },
      { delta: 'c"}', toolCallId: CALL, type: "TOOL_CALL_ARGS" },
    ] as unknown as AGUIEvent[]);

    expect(JSON.parse(tree.find((e) => e.id === CALL)?.args ?? "{}").a).toBe(
      "b c"
    );
  });
});

describe("foldStreamedDeltas", () => {
  const CALL = "call_fold_1";

  it("folds a run of args chunks into one row carrying the assembled JSON", () => {
    // The reported symptom: dozens of rows reading "Schritt", "ster", "äch" —
    // newest-first, so the fragments read backwards and the value is unusable.
    const folded = foldStreamedDeltas([
      {
        toolCallId: CALL,
        toolCallName: "requestDecision",
        type: "TOOL_CALL_START",
      },
      { delta: '{"title":"N', toolCallId: CALL, type: "TOOL_CALL_ARGS" },
      { delta: "äch", toolCallId: CALL, type: "TOOL_CALL_ARGS" },
      { delta: "ster Schritt", toolCallId: CALL, type: "TOOL_CALL_ARGS" },
      { delta: '"}', toolCallId: CALL, type: "TOOL_CALL_ARGS" },
      { toolCallId: CALL, type: "TOOL_CALL_END" },
    ] as unknown as AGUIEvent[]);

    expect(folded.map((f) => f.event.type)).toEqual([
      "TOOL_CALL_START",
      "TOOL_CALL_ARGS",
      "TOOL_CALL_END",
    ]);
    const args = folded[1];
    expect(args?.chunks).toBe(4);
    expect(eventFullText(args?.event as AGUIEvent)).toContain(
      "Nächster Schritt"
    );
  });

  it("folds assistant text chunks per message", () => {
    const folded = foldStreamedDeltas([
      { delta: "Hallo", messageId: "m1", type: "TEXT_MESSAGE_CONTENT" },
      { delta: " Welt", messageId: "m1", type: "TEXT_MESSAGE_CONTENT" },
    ] as unknown as AGUIEvent[]);

    expect(folded).toHaveLength(1);
    expect(folded[0]?.chunks).toBe(2);
    expect(eventFullText(folded[0]?.event as AGUIEvent)).toBe("Hallo Welt");
  });

  it("keeps two interleaved calls apart", () => {
    const folded = foldStreamedDeltas([
      { delta: "a", toolCallId: "c1", type: "TOOL_CALL_ARGS" },
      { delta: "b", toolCallId: "c2", type: "TOOL_CALL_ARGS" },
      { delta: "c", toolCallId: "c1", type: "TOOL_CALL_ARGS" },
    ] as unknown as AGUIEvent[]);

    expect(folded).toHaveLength(3);
    expect(folded.every((f) => f.chunks === 1)).toBe(true);
  });

  it("does not mutate the caller's events", () => {
    const events = [
      { delta: "a", toolCallId: "c1", type: "TOOL_CALL_ARGS" },
      { delta: "b", toolCallId: "c1", type: "TOOL_CALL_ARGS" },
    ] as unknown as AGUIEvent[];

    foldStreamedDeltas(events);

    expect((events[0] as unknown as { delta: string }).delta).toBe("a");
  });

  it("leaves non-streamed events untouched", () => {
    const folded = foldStreamedDeltas([
      { messageId: "m1", type: "TEXT_MESSAGE_START" },
      { messageId: "m1", type: "TEXT_MESSAGE_END" },
    ] as unknown as AGUIEvent[]);
    expect(folded.map((f) => f.chunks)).toEqual([1, 1]);
  });
});

describe("eventFullText", () => {
  it("pretty-prints an assembled JSON payload", () => {
    const text = eventFullText({
      content: '{"ok":true}',
      type: "TOOL_CALL_RESULT",
    } as unknown as AGUIEvent);
    expect(text).toBe('{\n  "ok": true\n}');
  });

  it("returns plain text as-is", () => {
    expect(
      eventFullText({
        delta: "Hallo Welt",
        type: "TEXT_MESSAGE_CONTENT",
      } as unknown as AGUIEvent)
    ).toBe("Hallo Welt");
  });

  it("falls back to the whole event when there is no payload", () => {
    expect(
      eventFullText({
        runId: "r1",
        type: "RUN_FINISHED",
      } as unknown as AGUIEvent)
    ).toContain("RUN_FINISHED");
  });

  it("renders an embedded program as real lines, not escaped \\n", () => {
    const code = [
      "const projects = await external_engenty_tool_execute_readonly({",
      '  toolId: "projects_list",',
      "});",
      "return projects.length;",
    ].join("\n");

    const text = eventFullText({
      delta: JSON.stringify({ code }),
      type: "TOOL_CALL_ARGS",
    } as unknown as AGUIEvent);

    // The whole point: the program is readable, and no literal backslash-n.
    expect(text).toContain("── code ──");
    expect(text).toContain("return projects.length;");
    expect(text).not.toContain("\\n");
    expect(text.split("\n").length).toBeGreaterThan(4);
  });

  it("keeps scalar fields as JSON alongside a lifted long field", () => {
    const text = eventFullText({
      delta: JSON.stringify({ timeout: 30_000, code: "x\ny" }),
      type: "TOOL_CALL_ARGS",
    } as unknown as AGUIEvent);

    expect(text).toContain('"timeout": 30000');
    expect(text).toContain("── code ──");
  });

  it("leaves an all-scalar payload as plain pretty JSON", () => {
    const text = eventFullText({
      delta: JSON.stringify({ limit: 5, query: "offers" }),
      type: "TOOL_CALL_ARGS",
    } as unknown as AGUIEvent);

    expect(text).toBe('{\n  "limit": 5,\n  "query": "offers"\n}');
  });
});

describe("summaries lead with content, not UUIDs", () => {
  it("shows the assistant text for a message-content event", () => {
    // Was: "56d95702-ff42-46ae-bdbe-a7d1e00dde61" — a row that says nothing.
    expect(
      eventSummary({
        delta: "Gut, ich lege los mit Schritt 1",
        messageId: "56d95702-ff42-46ae-bdbe-a7d1e00dde61",
        type: "TEXT_MESSAGE_CONTENT",
      } as unknown as AGUIEvent)
    ).toBe("Gut, ich lege los mit Schritt 1");
  });

  it("falls back to the event type rather than an id", () => {
    const summary = eventSummary({
      messageId: "56d95702-ff42-46ae-bdbe-a7d1e00dde61",
      type: "TEXT_MESSAGE_START",
    } as unknown as AGUIEvent);
    expect(summary).toBe("TEXT_MESSAGE_START");
    expect(summary).not.toContain("56d95702");
  });

  it("keeps a CUSTOM event's name", () => {
    expect(
      eventSummary({
        name: "engenty.debug.initial_prompt",
        runId: "8fc8c697-37cc-48ab-9f6b-faec59faa541",
        type: "CUSTOM",
      } as unknown as AGUIEvent)
    ).toBe("engenty.debug.initial_prompt");
  });

  it("exposes the ids separately for the muted expanded line", () => {
    expect(
      eventIdentifiers({
        messageId: "56d95702-ff42-46ae-bdbe-a7d1e00dde61",
        runId: "8fc8c697-37cc-48ab-9f6b-faec59faa541",
        type: "TEXT_MESSAGE_CONTENT",
      } as unknown as AGUIEvent)
    ).toBe(
      "message 56d95702-ff42-46ae-bdbe-a7d1e00dde61 · run 8fc8c697-37cc-48ab-9f6b-faec59faa541"
    );
  });

  it("returns no identifiers when the event carries none", () => {
    expect(
      eventIdentifiers({ type: "RUN_STARTED" } as unknown as AGUIEvent)
    ).toBeNull();
  });
});
