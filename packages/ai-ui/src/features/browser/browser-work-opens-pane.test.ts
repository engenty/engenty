import { describe, expect, it } from "vitest";

import { runsWithBrowserWork } from "./browser-work-opens-pane.js";

describe("runsWithBrowserWork", () => {
  it("names the run once for its first browser tool call", () => {
    expect(
      runsWithBrowserWork([
        { runId: "r1", type: "RUN_STARTED" },
        {
          toolCallId: "c1",
          toolCallName: "web_search",
          type: "TOOL_CALL_START",
        },
        {
          toolCallId: "c2",
          toolCallName: "browser_goto",
          type: "TOOL_CALL_START",
        },
        {
          toolCallId: "c3",
          toolCallName: "browser_run_fast",
          type: "TOOL_CALL_START",
        },
        { runId: "r2", type: "RUN_STARTED" },
        {
          toolCallId: "c4",
          toolCallName: "browser_snapshot",
          type: "TOOL_CALL_START",
        },
      ])
    ).toEqual(["r1", "r2"]);
  });

  it("ignores the in-app UI tools and runs without browser work", () => {
    expect(
      runsWithBrowserWork([
        { runId: "r1", type: "RUN_STARTED" },
        { toolCallId: "c1", toolCallName: "ui_click", type: "TOOL_CALL_START" },
        { toolCallId: "c2", toolCallName: "navigate", type: "TOOL_CALL_START" },
      ])
    ).toEqual([]);
  });

  it("falls back to the call id when no run start was seen", () => {
    expect(
      runsWithBrowserWork([
        {
          toolCallId: "c9",
          toolCallName: "browser_click",
          type: "TOOL_CALL_START",
        },
      ])
    ).toEqual(["c9"]);
  });
});
