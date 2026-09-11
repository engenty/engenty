import { describe, expect, it } from "vitest";
import {
  agentDefaultEffort,
  guessEffortFromPrompt,
} from "../auto-effort-guess.js";

describe("agentDefaultEffort", () => {
  it("is the agent's declared tier", () => {
    expect(agentDefaultEffort({ effort: "high" })).toBe("high");
    expect(agentDefaultEffort({ effort: "low", toolIds: ["app_build"] })).toBe(
      "low"
    );
  });

  it("is high for whoever holds a coding tool, whatever the id", () => {
    // A hired "apps.coder" is a registry row, not the module's agent id —
    // the tool it holds is what says it writes software.
    expect(
      agentDefaultEffort({ toolIds: ["engenty_tools_search", "app_build"] })
    ).toBe("high");
    expect(agentDefaultEffort({ toolIds: ["contacts_list"] })).toBeNull();
    expect(agentDefaultEffort(null)).toBeNull();
  });
});

describe("guessEffortFromPrompt", () => {
  it("answers the agent's own tier before reading the turn", () => {
    expect(
      guessEffortFromPrompt({
        agentEffort: "high",
        agentId: "apps.coder",
        text: "Und - kannst du das umsetzen",
      })
    ).toMatchObject({
      confidence: "certain",
      effort: "high",
      reason: "agent:apps.coder",
    });
    // Without one, the same short turn reads as cheap — which is exactly how
    // a hired coder's "go ahead" ended up at medium.
    expect(
      guessEffortFromPrompt({
        agentId: "apps.coder",
        text: "Und - kannst du das umsetzen",
      }).effort
    ).not.toBe("high");
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
