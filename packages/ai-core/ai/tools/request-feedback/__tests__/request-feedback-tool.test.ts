import { describe, expect, it } from "vitest";
import {
  buildRequestFeedbackTool,
  createRequestFeedbackArtifact,
} from "../request-feedback-tool.js";

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

  it("builds a Mastra-compatible tool definition through the caller adapter", async () => {
    const tool = buildRequestFeedbackTool((definition) => definition);

    expect(tool.id).toBe("requestFeedback");
    expect(tool.description).toContain("free-form text input");
    expect(tool.inputSchema.safeParse({ title: "" }).success).toBe(false);
    await expect(
      tool.execute({
        title: "Confirm changes",
        body: "Please explain your changes.",
      })
    ).resolves.toMatchObject({
      artifact_type: "feedback",
      title: "Confirm changes",
      body: "Please explain your changes.",
    });
  });
  it("tells a run with no human channel that nobody was asked", async () => {
    // The default wording ("Wait for the user's typed response") is a lie on a
    // background run: nothing was shown and nobody can type. A model told to
    // wait either stalls or invents an answer.
    const tool = buildRequestFeedbackTool((definition) => definition, {
      hasHumanChannel: () => false,
    });

    const output = await tool.execute({ title: "Which client?" });

    expect(output).toEqual({
      artifact_type: "feedback_unavailable",
      question: "Which client?",
      reason: "no_human_channel",
    });
    expect(tool.toModelOutput(output).value).toContain("no human channel");
    expect(tool.toModelOutput(output).value).toContain("Do NOT wait");
  });

  it("keeps the chat behaviour when a human channel is present", async () => {
    const tool = buildRequestFeedbackTool((definition) => definition, {
      hasHumanChannel: () => true,
    });

    const output = await tool.execute({ title: "How did we do?" });

    expect(output).toMatchObject({ artifact_type: "feedback" });
    expect(tool.toModelOutput(output).value).toContain("Wait for the user");
  });
});
