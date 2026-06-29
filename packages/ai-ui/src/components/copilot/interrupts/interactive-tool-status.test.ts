import { describe, expect, it } from "vitest";
import { getInteractiveToolStatus } from "./interactive-tool-status.js";

const decisionOutput = {
  artifact_id: "a1",
  artifact_type: "decision",
  choices: [{ id: "a", label: "A" }],
  interrupt_id: "a1",
  title: "Pick",
};

describe("getInteractiveToolStatus", () => {
  it("executing when the tool call is in the pending set and unresolved", () => {
    expect(
      getInteractiveToolStatus({
        toolCallId: "tc-1",
        toolName: "requestDecision",
        output: decisionOutput,
        pendingInterruptToolCallIds: new Set(["tc-1"]),
        optimisticInterruptResults: {},
      })
    ).toEqual({ status: "executing", resolvedLabel: null });
  });

  it("complete with optimistic result (takes precedence over pending)", () => {
    expect(
      getInteractiveToolStatus({
        toolCallId: "tc-1",
        toolName: "requestDecision",
        output: decisionOutput,
        pendingInterruptToolCallIds: new Set(["tc-1"]),
        optimisticInterruptResults: { "tc-1": "A" },
      })
    ).toEqual({ status: "complete", resolvedLabel: "A" });
  });

  it("complete with the persisted resolution from output", () => {
    expect(
      getInteractiveToolStatus({
        toolCallId: "tc-1",
        toolName: "requestDecision",
        output: { ...decisionOutput, choice_id: "a", choice_label: "A" },
        pendingInterruptToolCallIds: new Set(),
        optimisticInterruptResults: {},
      })
    ).toEqual({ status: "complete", resolvedLabel: "A" });
  });

  it("complete (no result) for a historical call not in the pending set", () => {
    expect(
      getInteractiveToolStatus({
        toolCallId: "tc-1",
        toolName: "requestDecision",
        output: decisionOutput,
        pendingInterruptToolCallIds: new Set(),
        optimisticInterruptResults: {},
      })
    ).toEqual({ status: "complete", resolvedLabel: null });
  });

  it("reads feedback resolution for requestFeedback", () => {
    expect(
      getInteractiveToolStatus({
        toolCallId: "tc-f",
        toolName: "requestFeedback",
        output: { feedback: "looks good" },
        pendingInterruptToolCallIds: new Set(),
        optimisticInterruptResults: {},
      })
    ).toEqual({ status: "complete", resolvedLabel: "looks good" });
  });
});
