import { describe, expect, it } from "vitest";
import {
  buildAssistantActivitySignature,
  deriveAgentStatusTicker,
} from "./derive-agent-status-ticker.js";

describe("deriveAgentStatusTicker", () => {
  it("requested: submitted with no assistant uses waiting label", () => {
    const s = deriveAgentStatusTicker({
      chatStatus: "submitted",
      messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }],
    });
    expect(s.outcome).toBe("requested");
    expect(s.phase).toBe("requested");
    expect(s.label).toBe("Waiting…");
    expect(s.showSpinner).toBe(true);
    expect(s.variant).toBe("muted");
  });

  it("running: streaming text uses shimmer and step text", () => {
    const s = deriveAgentStatusTicker({
      chatStatus: "streaming",
      messages: [
        {
          role: "assistant",
          parts: [{ type: "text", text: "Partial answer here" }],
        },
      ],
    });
    expect(s.outcome).toBe("running");
    expect(s.phase).toBe("turn_start");
    expect(s.stepKind).toBe("text");
    expect(s.label).toBe("Partial answer here");
    expect(s.showShimmer).toBe(true);
    expect(s.showSpinner).toBe(false);
    expect(s.variant).toBe("active");
  });

  it("last step wins: tool after text replaces label", () => {
    const s = deriveAgentStatusTicker({
      chatStatus: "streaming",
      messages: [
        {
          role: "assistant",
          parts: [
            { type: "text", text: "Calling tool" },
            {
              type: "tool-search",
              state: "input-available",
              toolCallId: "tc-search-1",
              input: { query: "search" },
            },
          ],
        },
      ],
    });
    expect(s.stepKind).toBe("tool");
    expect(s.label).toContain("search");
    expect(s.showShimmer).toBe(false);
    expect(s.showSpinner).toBe(true);
  });

  it("text after completed tool shows latest text", () => {
    const s = deriveAgentStatusTicker({
      chatStatus: "streaming",
      messages: [
        {
          role: "assistant",
          parts: [
            {
              type: "tool-search",
              state: "output-available",
              toolCallId: "tc-search-2",
              input: { query: "search" },
              output: { results: [] },
            },
            { type: "text", text: "Final summary line" },
          ],
        },
      ],
    });
    expect(s.stepKind).toBe("text");
    expect(s.label).toBe("Final summary line");
  });

  it("error chat status", () => {
    const s = deriveAgentStatusTicker({
      chatStatus: "error",
      messages: [],
    });
    expect(s.outcome).toBe("error");
    expect(s.phase).toBe("run_end");
    expect(s.variant).toBe("destructive");
    expect(s.label).toContain("Something went wrong");
  });

  it("error from errorMessage", () => {
    const s = deriveAgentStatusTicker({
      chatStatus: "streaming",
      messages: [],
      errorMessage: "Rate limited",
    });
    expect(s.outcome).toBe("error");
    expect(s.label).toBe("Rate limited");
  });

  it("stale forces stale outcome and turn_end phase", () => {
    const s = deriveAgentStatusTicker({
      chatStatus: "streaming",
      messages: [{ role: "assistant", parts: [{ type: "text", text: "x" }] }],
      stale: true,
    });
    expect(s.outcome).toBe("stale");
    expect(s.phase).toBe("turn_end");
    expect(s.variant).toBe("muted");
  });

  it("success ready with no parts shows Done", () => {
    const s = deriveAgentStatusTicker({
      chatStatus: "ready",
      messages: [{ role: "assistant", parts: [] }],
    });
    expect(s.outcome).toBe("success");
    expect(s.phase).toBe("run_end");
    expect(s.label).toBe("Done");
    expect(s.variant).toBe("success");
  });

  it("run failed maps to error", () => {
    const s = deriveAgentStatusTicker({
      chatStatus: "ready",
      messages: [],
      runStatus: "failed",
    });
    expect(s.outcome).toBe("error");
  });

  it("custom labels", () => {
    const s = deriveAgentStatusTicker({
      chatStatus: "submitted",
      messages: [],
      labels: { waiting: "Bitte warten…" },
    });
    expect(s.label).toBe("Bitte warten…");
  });

  it("submitted follow-up run hides stale assistant text until activity changes", () => {
    const messages = [
      {
        role: "assistant" as const,
        parts: [{ type: "text", text: "Previous answer from last turn" }],
      },
    ];
    const baseline = buildAssistantActivitySignature(messages);
    const s = deriveAgentStatusTicker({
      activityBaselineSignature: baseline,
      chatStatus: "submitted",
      messages,
    });
    expect(s.label).toBe("Thinking…");
    expect(s.showSpinner).toBe(true);
  });

  it("streaming follow-up run shows new assistant text after activity changes", () => {
    const messages = [
      {
        role: "assistant" as const,
        parts: [{ type: "text", text: "Previous answer from last turn" }],
      },
    ];
    const baseline = buildAssistantActivitySignature(messages);
    const s = deriveAgentStatusTicker({
      activityBaselineSignature: baseline,
      chatStatus: "streaming",
      messages: [
        {
          role: "assistant",
          parts: [
            { type: "text", text: "Previous answer from last turn updated" },
          ],
        },
      ],
    });
    expect(s.label).toBe("Previous answer from last turn updated");
    expect(s.showShimmer).toBe(true);
  });

  it("statusOnly hides transcript text in composer flap", () => {
    const s = deriveAgentStatusTicker({
      chatStatus: "streaming",
      messages: [
        {
          role: "assistant",
          parts: [
            { type: "text", text: "Ich öffne die Team-Mitglieder-Seite" },
          ],
        },
      ],
      statusOnly: true,
      labels: { thinking: "Denkt nach…" },
    });
    expect(s.label).toBe("Denkt nach…");
    expect(s.showShimmer).toBe(false);
    expect(s.showSpinner).toBe(true);
  });

  it("statusOnly still surfaces active tool steps", () => {
    const s = deriveAgentStatusTicker({
      chatStatus: "streaming",
      messages: [
        {
          role: "assistant",
          parts: [
            { type: "text", text: "Opening page" },
            {
              type: "dynamic-tool",
              state: "input-available",
              toolCallId: "tc-nav",
              toolName: "navigate",
              input: { to: "/mdl/team" },
            },
          ],
        },
      ],
      statusOnly: true,
    });
    expect(s.stepKind).toBe("tool");
    expect(s.label).toContain("navigate");
  });

  it("collects recent tool steps newest-first for expansion", () => {
    const s = deriveAgentStatusTicker({
      chatStatus: "streaming",
      messages: [
        {
          role: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              state: "output-available",
              toolCallId: "tc-1",
              toolName: "search_contacts",
              input: {},
              output: {},
            },
            {
              type: "dynamic-tool",
              state: "input-available",
              toolCallId: "tc-2",
              toolName: "navigate",
              input: {},
            },
          ],
        },
      ],
      statusOnly: true,
    });
    expect(s.recentSteps).toHaveLength(2);
    expect(s.recentSteps[0]?.label).toContain("navigate");
    expect(s.recentSteps[1]?.label).toContain("search_contacts");
    expect(s.canExpandSteps).toBe(true);
  });

  it("allows expansion when reasoning label is shortened", () => {
    const longReasoning = `${"analyze ".repeat(40)}done`;
    const s = deriveAgentStatusTicker({
      chatStatus: "streaming",
      messages: [
        {
          role: "assistant",
          parts: [{ type: "reasoning", text: longReasoning }],
        },
      ],
    });
    expect(s.canExpandSteps).toBe(true);
    expect(s.fullLabel.length).toBeGreaterThan(s.label.length);
  });
});
