import type { AGUIEvent } from "@engenty/ag-ui-bridge";
import { describe, expect, it } from "vitest";
import {
  buildToolCallNameIndex,
  eventSummary,
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

  it("keeps the id-based summary for non-tool events", () => {
    expect(
      eventSummary({
        runId: "run-1",
        type: "RUN_FINISHED",
      } as unknown as AGUIEvent)
    ).toBe("run-1");
  });
});
