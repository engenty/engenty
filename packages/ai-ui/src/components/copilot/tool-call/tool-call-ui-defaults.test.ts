// Routing for the built-in tool-call cards.
//
// The decision card is the one worth pinning: `requestDecision` suspends the run
// natively (apps/ai native-request-decision.ts) and hands its artifact over as
// the SUSPEND payload, so the tool call reaches the client with no output. A
// registry that matched on the output shape alone routed it to the generic card
// — a spinning "Decision needed" row with no chooser and no way to answer it.
import { describe, expect, it } from "vitest";
import { DecisionArtifactToolCallCard } from "./decision-artifact-tool-call-card.js";
import { ToolCallGenericCard } from "./tool-call-generic-card.js";
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

  it("routes an answered requestDecision to the decision card too", () => {
    // The card renders the resolved summary; it must not fall through to the
    // generic row just because the output is now the user's answer.
    expect(
      resolveRoutedToolCallCard({
        output: { choice_id: "a", choice_label: "Keep entry A" },
        state: "completed",
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

  it("leaves unrelated tools on the generic card", () => {
    expect(
      resolveRoutedToolCallCard({
        output: { ok: true },
        state: "completed",
        toolCallId: "tc-3",
        toolName: "contacts_search",
      })
    ).toBe(ToolCallGenericCard);
  });
});
