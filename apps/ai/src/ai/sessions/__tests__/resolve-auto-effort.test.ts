import { describe, expect, it } from "vitest";
import {
  resolveAutoEffort,
  resolveEffortForRun,
} from "../resolve-auto-effort.js";

describe("resolveAutoEffort", () => {
  it("skips the classifier when heuristics are certain (coding)", async () => {
    const result = await resolveAutoEffort({
      jev: null,
      text: "Refactor the auth module across files",
    });
    expect(result).toMatchObject({
      effort: "high",
      source: "heuristic",
    });
  });

  it("skips the classifier for tool-shaped asks (medium floor)", async () => {
    const result = await resolveAutoEffort({
      jev: null,
      text: "Create a contact for Acme Corp",
    });
    expect(result).toMatchObject({
      effort: "medium",
      source: "heuristic",
    });
  });

  it("skips the classifier for greetings (low)", async () => {
    const result = await resolveAutoEffort({ jev: null, text: "hi" });
    expect(result).toMatchObject({ effort: "low", source: "heuristic" });
  });

  it("falls back to the guess when no classifier is configured", async () => {
    const result = await resolveAutoEffort({
      jev: null,
      text: "Can you help me think through how our onboarding should work for enterprise customers next quarter?",
    });
    expect(result).toMatchObject({ effort: "medium", source: "fallback" });
  });

  it("clamps classifier/heuristic results to the plan grant", async () => {
    const result = await resolveAutoEffort({
      allowedEfforts: ["low"],
      jev: null,
      text: "Refactor the auth module across files",
    });
    expect(result.effort).toBe("low");
  });

  it("short-circuits when the plan only grants one tier", async () => {
    const result = await resolveAutoEffort({
      allowedEfforts: ["medium"],
      jev: null,
      text: "anything goes here but we never classify",
    });
    expect(result).toMatchObject({
      effort: "medium",
      source: "ceiling",
    });
  });
});

describe("resolveAutoEffort with Jev", () => {
  const ambiguous =
    "Can you help me think through how our onboarding should work for enterprise customers next quarter?";
  const jevAnswering = (
    choice: string,
    confidence: number,
    delayMs = 0
  ): {
    calls: unknown[];
    client: import("@engenty/typesafe-client").TypeSafeClient;
  } => {
    const calls: unknown[] = [];
    const rest = (1 - confidence) / 2;
    const probabilities: Record<string, number> = {
      high: rest,
      low: rest,
      medium: rest,
    };
    probabilities[choice] = confidence;
    return {
      calls,
      client: {
        systemOne: async (request: unknown) => {
          calls.push(request);
          if (delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
          return {
            answers: {
              effort: { choice, confidence, probabilities, type: "choice" },
            },
            model: "jev-test",
          };
        },
      } as unknown as import("@engenty/typesafe-client").TypeSafeClient,
    };
  };

  it("asks Jev when the heuristics are unsure", async () => {
    const jev = jevAnswering("high", 0.9);
    const result = await resolveAutoEffort({
      jev: jev.client,
      text: ambiguous,
    });
    expect(jev.calls).toHaveLength(1);
    expect(result).toMatchObject({ effort: "high", source: "router" });
  });

  it("ignores a pick below the confidence floor", async () => {
    const jev = jevAnswering("high", 0.4);
    const result = await resolveAutoEffort({
      jev: jev.client,
      text: ambiguous,
    });
    expect(result).toMatchObject({ effort: "medium", source: "fallback" });
  });

  it("falls back when Jev is slower than the budget", async () => {
    const jev = jevAnswering("high", 0.9, 50);
    const result = await resolveAutoEffort({
      jev: jev.client,
      text: ambiguous,
      timeoutMs: 10,
    });
    expect(result).toMatchObject({ effort: "medium", source: "fallback" });
  });

  it("never asks Jev when the heuristics are certain", async () => {
    const jev = jevAnswering("low", 1);
    const result = await resolveAutoEffort({ jev: jev.client, text: "hi" });
    expect(jev.calls).toHaveLength(0);
    expect(result.source).toBe("heuristic");
  });
});

describe("resolveEffortForRun", () => {
  it("passes explicit picks through (clamped)", async () => {
    await expect(
      resolveEffortForRun({
        allowedEfforts: ["low", "medium"],
        choice: "high",
        text: "whatever",
      })
    ).resolves.toEqual({ autoResolved: false, effort: "medium" });
  });

  it("skips Auto when an expert model pin is set", async () => {
    await expect(
      resolveEffortForRun({
        choice: "auto",
        modelIdOverride: "openai/gpt-5",
        text: "Refactor everything",
      })
    ).resolves.toEqual({ autoResolved: false, effort: null });
  });

  it("sizes Auto turns", async () => {
    await expect(
      resolveEffortForRun({
        choice: "auto",
        text: "hi",
      })
    ).resolves.toMatchObject({
      autoResolved: true,
      effort: "low",
    });
  });
});
