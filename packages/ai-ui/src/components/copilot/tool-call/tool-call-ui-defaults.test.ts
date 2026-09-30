// A suspended `requestDecision` reaches the client with no output; routing it
// by output shape alone leaves a chooser nobody can answer.
import { describe, expect, it } from "vitest";
import { DecisionArtifactToolCallCard } from "./decision-artifact-tool-call-card.js";
import { resolveRoutedToolCallCard } from "./tool-call-ui-defaults.js";

const DECISION_ARTIFACT = {
  artifact_id: "artifact-1",
  artifact_type: "decision",
  choices: [{ id: "a", label: "Keep entry A" }],
  interrupt_id: "artifact-1",
  title: "Which entry should I keep?",
};

describe("resolveRoutedToolCallCard", () => {
  it("routes a SUSPENDED requestDecision (no output) to the decision card", () => {
    expect(
      resolveRoutedToolCallCard({
        state: "running",
        toolCallId: "tc-1",
        toolName: "requestDecision",
      })
    ).toBe(DecisionArtifactToolCallCard);
  });

  it("still routes a decision ARTIFACT output under any tool name", () => {
    // Tool-approval cards arrive this way — as an artifact result from
    // `engenty_tool_execute`, not from `requestDecision`.
    expect(
      resolveRoutedToolCallCard({
        output: DECISION_ARTIFACT,
        state: "completed",
        toolCallId: "tc-2",
        toolName: "engenty_tool_execute",
      })
    ).toBe(DecisionArtifactToolCallCard);
  });
});
