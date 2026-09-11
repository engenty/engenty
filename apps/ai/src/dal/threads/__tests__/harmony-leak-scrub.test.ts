import { describe, expect, it } from "vitest";

import {
  scrubHarmonyLeakFromParts,
  scrubHarmonyLeakFromText,
} from "../harmony-leak-scrub.js";

describe("scrubHarmonyLeakFromText", () => {
  it("keeps only the final channel when a full leak is present", () => {
    // Verbatim shape from a live gpt-oss-20b leak: analysis + fabricated tool
    // traffic in the text channel, then the final channel.
    const leak =
      'analysisWe found an agent ID fun.hello-world. So we will message him.<|end|><|start|>assistant<|channel|>commentary to=functions.message_agentjson<|message|>{"agent_id":"fun.hello-world","message":"Hi"}assistant<|channel|>commentary<|message|>{"response":"Sure thing!"}<|call|>assistant<|channel|>final<|message|>Hier ist der Wiz:';
    expect(scrubHarmonyLeakFromText(leak)).toBe("Hier ist der Wiz:");
  });

  it("strips a leading final marker", () => {
    expect(
      scrubHarmonyLeakFromText("final<|message|>Here are the specialists:")
    ).toBe("Here are the specialists:");
  });

  it("cuts at a glued assistantfinal when the tokens themselves were eaten", () => {
    // Fully degraded live shape: channel headers glued into the words.
    const leak =
      'analysisThe agent has been messaged.<|end|>assistantcommentary to=functions.message_agentresponse{"session":"x"}assistantfinalI’ve sent a ping to the Joker agent.';
    expect(scrubHarmonyLeakFromText(leak)).toBe(
      "I’ve sent a ping to the Joker agent."
    );
  });

  it("treats a glued analysis stream without tokens as a leak", () => {
    expect(
      scrubHarmonyLeakFromText(
        "analysisWe found an agent ID.assistantfinalDone."
      )
    ).toBe("Done.");
  });

  it("does not touch prose that merely starts with the word analysis", () => {
    const clean = "analysis of the quarter shows growth.";
    expect(scrubHarmonyLeakFromText(clean)).toBe(clean);
  });

  it("drops stray tokens when no final channel exists", () => {
    expect(scrubHarmonyLeakFromText("We need X<|end|> then Y")).toBe(
      "We need X then Y"
    );
  });

  it("leaves clean text untouched", () => {
    const clean = "A friendly answer with final words and | pipes.";
    expect(scrubHarmonyLeakFromText(clean)).toBe(clean);
  });
});

describe("scrubHarmonyLeakFromParts", () => {
  it("scrubs text parts and keeps others verbatim, copying only on change", () => {
    const tool = { input: {}, type: "dynamic-tool" };
    const parts = [
      {
        text: "analysisX<|end|>assistant<|channel|>final<|message|>Hi.",
        type: "text",
      },
      tool,
    ];
    const next = scrubHarmonyLeakFromParts(parts) as Array<{
      text?: string;
    }>;
    expect(next).not.toBe(parts);
    expect(next[0]?.text).toBe("Hi.");
    expect(next[1]).toBe(tool);

    const clean = [{ text: "Hi.", type: "text" }];
    expect(scrubHarmonyLeakFromParts(clean)).toBe(clean);
  });

  it("passes non-array parts through", () => {
    expect(scrubHarmonyLeakFromParts(null)).toBe(null);
  });
});
