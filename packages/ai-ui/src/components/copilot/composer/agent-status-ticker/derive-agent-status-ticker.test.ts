import { describe, expect, it } from "vitest";
import {
  buildAssistantActivitySignature,
  deriveAgentStatusTicker,
} from "./derive-agent-status-ticker.js";
import type { AgentStatusTickerLabels } from "./types.js";

const labels: AgentStatusTickerLabels = {
  collapseSteps: "Hide recent steps",
  done: "Done",
  error: "Error",
  expandSteps: "Show recent steps",
  somethingWentWrong: "Something went wrong.",
  stale: "Out of date",
  thinking: "Thinking…",
  waiting: "Waiting…",
};

describe("deriveAgentStatusTicker", () => {
  it.each([
    {
      case: "a stream error",
      input: { chatStatus: "error", messages: [] },
    },
    {
      case: "an error message mid-stream",
      input: { chatStatus: "streaming", errorMessage: "x", messages: [] },
    },
    {
      case: "a failed run on a ready chat",
      input: { chatStatus: "ready", messages: [], runStatus: "failed" },
    },
  ] as const)("reports $case as an error, never as running or done", ({
    input,
  }) => {
    expect(deriveAgentStatusTicker({ ...input, labels }).outcome).toBe("error");
  });

  it("shows the error message it was given instead of a progress label", () => {
    const s = deriveAgentStatusTicker({
      chatStatus: "streaming",
      errorMessage: "Rate limited",
      labels,
      messages: [],
    });
    expect(s.label).toBe("Rate limited");
  });

  it("does not show the previous turn's tool step as progress of a new run", () => {
    const navigateDone = {
      input: {},
      output: {},
      state: "output-available",
      toolCallId: "tc-nav",
      toolName: "navigate",
      type: "dynamic-tool",
    };
    const previousTurn = [
      { parts: [navigateDone], role: "assistant" as const },
    ];
    const baseline = buildAssistantActivitySignature(previousTurn);

    const beforeActivity = deriveAgentStatusTicker({
      activityBaselineSignature: baseline,
      chatStatus: "submitted",
      labels: { ...labels, thinking: "Denkt nach…" },
      messages: previousTurn,
    });
    expect(beforeActivity.label).toBe("Denkt nach…");

    const afterActivity = deriveAgentStatusTicker({
      activityBaselineSignature: baseline,
      chatStatus: "streaming",
      labels: { ...labels, thinking: "Denkt nach…" },
      messages: [
        {
          parts: [
            navigateDone,
            {
              input: {},
              state: "input-available",
              toolCallId: "tc-search",
              toolName: "search_contacts",
              type: "dynamic-tool",
            },
          ],
          role: "assistant",
        },
      ],
    });
    expect(afterActivity.label).toContain("search_contacts");
  });
});
