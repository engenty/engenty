import { describe, expect, it } from "vitest";
import { guessEffortFromPrompt } from "../auto-effort-guess.js";

describe("guessEffortFromPrompt", () => {
  it("forces high for coding / CLI specialist agents", () => {
    expect(
      guessEffortFromPrompt({ agentId: "engenty.cli", text: "hi" })
    ).toMatchObject({ confidence: "certain", effort: "high" });
    expect(
      guessEffortFromPrompt({
        agentId: "engenty.app-coder",
        text: "hello",
      })
    ).toMatchObject({ confidence: "certain", effort: "high" });
  });

  it("sizes coding / multi-edit prompts as high", () => {
    expect(
      guessEffortFromPrompt({
        text: "Refactor the auth module across files and write a plan",
      })
    ).toMatchObject({ confidence: "certain", effort: "high" });
    expect(
      guessEffortFromPrompt({
        text: "Debug this stack trace and fix all the errors",
      })
    ).toMatchObject({ confidence: "certain", effort: "high" });
  });

  it("floors tool / data ops at medium", () => {
    expect(
      guessEffortFromPrompt({
        text: "Create a contact for Acme and add a follow-up task",
      })
    ).toMatchObject({ confidence: "certain", effort: "medium" });
    expect(
      guessEffortFromPrompt({ text: "Search projects for Q3 launch" })
    ).toMatchObject({ confidence: "certain", effort: "medium" });
    expect(
      guessEffortFromPrompt({ text: "Send an email to the client" })
    ).toMatchObject({ confidence: "certain", effort: "medium" });
  });

  it("keeps greetings and short simple asks on low", () => {
    expect(guessEffortFromPrompt({ text: "hi" })).toMatchObject({
      confidence: "certain",
      effort: "low",
    });
    expect(guessEffortFromPrompt({ text: "What is Engenty?" })).toMatchObject({
      confidence: "certain",
      effort: "low",
    });
  });

  it("marks ambiguous longer prompts as uncertain (router candidate)", () => {
    const guess = guessEffortFromPrompt({
      text: "Can you help me think through how our onboarding should work for enterprise customers next quarter?",
    });
    expect(guess.confidence).toBe("uncertain");
    expect(guess.effort).toBe("medium");
  });

  it("treats attachments as at least medium", () => {
    expect(
      guessEffortFromPrompt({ hasAttachments: true, text: "" })
    ).toMatchObject({ confidence: "certain", effort: "medium" });
  });
});
