import { describe, expect, it } from "vitest";
import {
  feedbackArtifactFromOpenInterrupt,
  resolveFeedbackArtifactForToolCall,
} from "./feedback-artifact.js";

describe("resolveFeedbackArtifactForToolCall", () => {
  const openInterrupt = {
    artifact_id: "artifact-2",
    body: "Please explain your logic.",
    interrupt_id: "artifact-2",
    kind: "feedback" as const,
    title: "Explanation needed",
    tool_call_id: "tc-2",
    placeholder: "Explain here...",
    submit_label: "Submit Explanation",
  };

  it("prefers transcript output when properties are present", () => {
    expect(
      resolveFeedbackArtifactForToolCall(
        {
          artifact_id: "artifact-2",
          artifact_type: "feedback",
          interrupt_id: "artifact-2",
          title: "Explanation needed",
          body: "Please explain your logic.",
        },
        openInterrupt
      )
    ).toEqual({
      artifactId: "artifact-2",
      body: "Please explain your logic.",
      placeholder: undefined,
      submitLabel: undefined,
      interruptId: "artifact-2",
      title: "Explanation needed",
    });
  });

  it("hydrates from open interrupt metadata after reload", () => {
    expect(
      resolveFeedbackArtifactForToolCall(
        {
          artifact_id: "artifact-2",
          artifact_type: "feedback",
          interrupt_id: "artifact-2",
          title: "Explanation needed",
        },
        openInterrupt
      )
    ).toEqual(feedbackArtifactFromOpenInterrupt(openInterrupt));
  });

  it("does not reuse open interrupt metadata for unrelated tool rows", () => {
    expect(
      resolveFeedbackArtifactForToolCall(
        {
          artifact_id: "artifact-other",
          artifact_type: "feedback",
          interrupt_id: "artifact-other",
          title: "Other feedback",
        },
        openInterrupt
      )
    ).toBeNull();
  });
});
