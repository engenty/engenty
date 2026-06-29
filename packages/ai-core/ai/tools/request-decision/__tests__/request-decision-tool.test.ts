import { describe, expect, it } from "vitest";
import {
  buildRequestDecisionTool,
  createRequestDecisionArtifact,
} from "../request-decision-tool.js";

describe("request decision tool", () => {
  it("creates decision artifacts with stable user-facing shape", () => {
    const artifact = createRequestDecisionArtifact({
      body: "Pick a route.",
      choices: [{ id: "approve", label: "Approve" }],
      title: "Continue?",
    });

    expect(artifact).toMatchObject({
      artifact_type: "decision",
      body: "Pick a route.",
      choices: [{ id: "approve", label: "Approve" }],
      title: "Continue?",
    });
    expect(artifact.artifact_id).toEqual(expect.any(String));
    expect(artifact.interrupt_id).toBe(artifact.artifact_id);
  });

  it("builds a Mastra-compatible tool definition through the caller adapter", async () => {
    const tool = buildRequestDecisionTool((definition) => definition);

    expect(tool.id).toBe("requestDecision");
    expect(tool.description).toContain("interactive chooser widget");
    expect(tool.description).toContain("infer reasonable low-risk choices");
    expect(
      tool.inputSchema.safeParse({ choices: [], title: "Nope" }).success
    ).toBe(false);
    await expect(
      tool.execute({
        choices: [{ id: "yes", label: "Yes" }],
        title: "Proceed?",
      })
    ).resolves.toMatchObject({
      artifact_type: "decision",
      choices: [{ id: "yes", label: "Yes" }],
      title: "Proceed?",
    });
  });
});
