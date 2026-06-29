import { describe, expect, it } from "vitest";
import { pendingInterruptFromTranscript } from "./pending-interrupt-from-transcript.js";

function decisionPart(id: string, toolCallId: string, resolved = false) {
  return {
    type: "dynamic-tool",
    toolCallId,
    toolName: "requestDecision",
    state: "output-available",
    output: {
      artifact_id: id,
      artifact_type: "decision",
      choices: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      interrupt_id: id,
      title: `Decision ${id}`,
      ...(resolved ? { choice_id: "a", choice_label: "A" } : {}),
    },
  };
}

describe("pendingInterruptFromTranscript", () => {
  it("returns the last decision as open-interrupt metadata with its tool_call_id", () => {
    const open = pendingInterruptFromTranscript([
      { parts: [decisionPart("d1", "tc-1", true)] },
      { parts: [{ type: "text", text: "ok" }] },
      { parts: [decisionPart("d2", "tc-2")] },
    ]);

    expect(open?.tool_call_id).toBe("tc-2");
    expect(open?.kind).toBe("decision");
    expect(open?.choices).toHaveLength(2);
    expect(open?.title).toBe("Decision d2");
  });

  it("returns null when the most recent decision is already resolved", () => {
    const open = pendingInterruptFromTranscript([
      { parts: [decisionPart("d1", "tc-1", true)] },
    ]);
    expect(open).toBeNull();
  });

  it("returns feedback metadata for a pending requestFeedback part", () => {
    const open = pendingInterruptFromTranscript([
      {
        parts: [
          {
            type: "dynamic-tool",
            toolCallId: "tc-f",
            toolName: "requestFeedback",
            state: "output-available",
            output: {
              artifact_id: "f1",
              artifact_type: "feedback",
              interrupt_id: "f1",
              title: "Feedback",
            },
          },
        ],
      },
    ]);

    expect(open?.tool_call_id).toBe("tc-f");
    expect(open?.kind).toBe("feedback");
  });

  it("returns null when there is no interactive interrupt part", () => {
    expect(
      pendingInterruptFromTranscript([
        { parts: [{ type: "text", text: "hi" }] },
      ])
    ).toBeNull();
  });
});
