import { describe, expect, it } from "vitest";
import { createRequestFeedbackArtifact } from "../request-feedback-tool.js";

describe("request feedback tool", () => {
  it("creates feedback artifacts with stable user-facing shape", () => {
    const artifact = createRequestFeedbackArtifact({
      body: "Describe your experience.",
      placeholder: "Write here...",
      submitLabel: "Send Feedback",
      title: "How did we do?",
    });

    expect(artifact).toMatchObject({
      artifact_type: "feedback",
      body: "Describe your experience.",
      placeholder: "Write here...",
      submit_label: "Send Feedback",
      title: "How did we do?",
    });
    expect(artifact.artifact_id).toEqual(expect.any(String));
    expect(artifact.interrupt_id).toBe(artifact.artifact_id);
  });
});
