import { describe, expect, it } from "vitest";
import {
  decisionArtifactFromOpenInterrupt,
  resolveDecisionArtifactForToolCall,
} from "./decision-artifact.js";

describe("resolveDecisionArtifactForToolCall", () => {
  const openInterrupt = {
    artifact_id: "artifact-1",
    body: "Pick one entry to keep.",
    choices: [
      { id: "a", label: "Keep entry A" },
      { id: "b", label: "Keep entry B" },
    ],
    interrupt_id: "artifact-1",
    kind: "decision" as const,
    title: "Which entry should I keep?",
    tool_call_id: "tc-1",
  };

  it("prefers transcript output when choices are present", () => {
    expect(
      resolveDecisionArtifactForToolCall(
        {
          artifact_id: "artifact-1",
          artifact_type: "decision",
          choices: [{ id: "a", label: "Keep entry A" }],
          interrupt_id: "artifact-1",
          title: "Which entry should I keep?",
        },
        openInterrupt
      )
    ).toEqual({
      artifactId: "artifact-1",
      choices: [{ id: "a", label: "Keep entry A" }],
      interruptId: "artifact-1",
      title: "Which entry should I keep?",
    });
  });

  it("hydrates choices from open interrupt metadata after reload", () => {
    expect(
      resolveDecisionArtifactForToolCall(
        {
          artifact_id: "artifact-1",
          artifact_type: "decision",
          interrupt_id: "artifact-1",
          title: "Which entry should I keep?",
        },
        openInterrupt
      )
    ).toEqual(decisionArtifactFromOpenInterrupt(openInterrupt));
  });

  it("does not reuse open interrupt metadata for unrelated tool rows", () => {
    expect(
      resolveDecisionArtifactForToolCall(
        {
          artifact_id: "artifact-other",
          artifact_type: "decision",
          interrupt_id: "artifact-other",
          title: "Other decision",
        },
        openInterrupt
      )
    ).toBeNull();
  });
});
