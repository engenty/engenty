// Live 2026-08-24: a run showed three identical "Called skill" rows and a
// loose result below them. It had loaded three DIFFERENT skills — the name
// lives in TOOL_CALL_ARGS, and the answer in TOOL_CALL_RESULT, both tied to
// the call only by toolCallId.
import { describe, expect, it } from "vitest";
import type { AiRunEventRecord } from "../../lib/admin/ai-runtime-types.js";
import {
  buildRunTimeline,
  type RunTimelineCall,
  readRunPrompt,
} from "./run-timeline.js";

function event(
  seq: number,
  event_type: string,
  payload: Record<string, unknown>
): AiRunEventRecord {
  return {
    created_at: "2026-08-24T14:43:25.000Z",
    event_type,
    id: `e-${seq}`,
    level: null,
    message: null,
    payload,
    run_id: "run-1",
    seq,
  };
}

const skillCall = (seq: number, id: string, name: string, body: string) => [
  event(seq, "TOOL_CALL_START", { toolCallId: id, toolCallName: "skill" }),
  event(seq + 1, "TOOL_CALL_ARGS", {
    delta: `{"name":"${name}","_background":{"enabled":false}}`,
    toolCallId: id,
  }),
  event(seq + 2, "TOOL_CALL_END", { toolCallId: id }),
  event(seq + 3, "TOOL_CALL_RESULT", { content: body, toolCallId: id }),
];

describe("buildRunTimeline", () => {
  it("keeps each call with its own arguments and answer", () => {
    const timeline = buildRunTimeline([
      event(0, "RUN_STARTED", {}),
      ...skillCall(1, "call_a", "contacts-email-extraction", "# Extraction"),
      ...skillCall(5, "call_b", "inbox-triage", "# Inbox triage"),
    ]);

    const calls = timeline.filter(
      (entry): entry is RunTimelineCall => entry.kind === "call"
    );
    expect(calls).toHaveLength(2);
    expect(calls[0]?.name).toBe("skill");
    expect(calls[0]?.args).toBe('{"name":"contacts-email-extraction"}');
    expect(calls[0]?.result).toBe("# Extraction");
    expect(calls[1]?.args).toBe('{"name":"inbox-triage"}');
    expect(calls[1]?.result).toBe("# Inbox triage");
  });

  it("joins arguments that arrived in chunks", () => {
    const timeline = buildRunTimeline([
      event(0, "TOOL_CALL_START", {
        toolCallId: "c1",
        toolCallName: "tasks_list",
      }),
      event(1, "TOOL_CALL_ARGS", { delta: '{"page', toolCallId: "c1" }),
      event(2, "TOOL_CALL_ARGS", { delta: '":1}', toolCallId: "c1" }),
    ]);
    expect((timeline[0] as RunTimelineCall).args).toBe('{"page":1}');
  });

  it("drops the transport config every call carries", () => {
    const timeline = buildRunTimeline([
      event(0, "TOOL_CALL_START", {
        toolCallId: "c1",
        toolCallName: "inbox_accounts_list",
      }),
      event(1, "TOOL_CALL_ARGS", {
        delta: '{"_background":{"enabled":false,"timeoutMs":120000}}',
        toolCallId: "c1",
      }),
    ]);
    // A tool that takes no arguments should read as `inbox_accounts_list`,
    // not as a line of harness plumbing.
    expect((timeline[0] as RunTimelineCall).args).toBe("");
  });

  it("says so when a call never came back", () => {
    const timeline = buildRunTimeline([
      event(0, "TOOL_CALL_START", { toolCallId: "c1", toolCallName: "skill" }),
      event(1, "TOOL_CALL_ARGS", { delta: '{"name":"x"}', toolCallId: "c1" }),
    ]);
    expect((timeline[0] as RunTimelineCall).result).toBeNull();
  });

  it("is not confused by the duplicate END events the stream emits", () => {
    const timeline = buildRunTimeline([
      ...skillCall(0, "call_a", "contacts-search", "# Search"),
      event(9, "TOOL_CALL_END", { toolCallId: "call_a" }),
    ]);
    expect(timeline.filter((entry) => entry.kind === "call")).toHaveLength(1);
  });

  it("keeps run-level events in place, and marks an error", () => {
    const timeline = buildRunTimeline([
      event(0, "RUN_STARTED", {}),
      ...skillCall(1, "call_a", "x", "y"),
      { ...event(9, "RUN_ERROR", {}), level: "error", message: "boom" },
    ]);
    expect(timeline.map((entry) => entry.kind)).toEqual([
      "note",
      "call",
      "note",
    ]);
    const last = timeline[2];
    expect(last.kind === "note" && last.isError).toBe(true);
    expect(last.kind === "note" && last.detail).toBe("boom");
  });

  it("ignores the per-chunk text deltas entirely", () => {
    const timeline = buildRunTimeline([
      event(0, "TEXT_MESSAGE_START", {}),
      event(1, "TEXT_MESSAGE_CONTENT", { delta: "hello" }),
      event(2, "TEXT_MESSAGE_END", {}),
    ]);
    expect(timeline).toEqual([]);
  });
});

describe("readRunPrompt", () => {
  it("reads what was asked, across the deltas it arrived in", () => {
    expect(
      readRunPrompt([
        event(0, "RUN_STARTED", {}),
        event(1, "TEXT_MESSAGE_START", { role: "user" }),
        event(2, "TEXT_MESSAGE_CONTENT", { delta: "hast du " }),
        event(3, "TEXT_MESSAGE_CONTENT", { delta: "kontakte gefunden?" }),
        event(4, "TEXT_MESSAGE_END", {}),
      ])
    ).toBe("hast du kontakte gefunden?");
  });

  it("takes the question, not the answer", () => {
    expect(
      readRunPrompt([
        event(0, "TEXT_MESSAGE_START", { role: "user" }),
        event(1, "TEXT_MESSAGE_CONTENT", { delta: "ask" }),
        event(2, "TEXT_MESSAGE_END", {}),
        event(3, "TEXT_MESSAGE_START", { role: "assistant" }),
        event(4, "TEXT_MESSAGE_CONTENT", { delta: "reply" }),
        event(5, "TEXT_MESSAGE_END", {}),
      ])
    ).toBe("ask");
  });

  it("is null for a run nobody typed into", () => {
    // A routine's brief never arrives as a user message; the header then shows
    // no prompt block rather than an empty one.
    expect(
      readRunPrompt([
        event(0, "RUN_STARTED", {}),
        event(1, "TOOL_CALL_START", { toolCallId: "c", toolCallName: "x" }),
      ])
    ).toBeNull();
  });
});
