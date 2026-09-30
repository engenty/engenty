import type { ClassifierClient } from "@engenty/typesafe-client";
import { describe, expect, it, vi } from "vitest";
import { resolveEffortForRun } from "../resolve-auto-effort.js";

const CODING = "Refactor the auth module across files";
const AMBIGUOUS =
  "Can you analyze how our onboarding should work for enterprise customers?";

function classifierAnswering(choice: "keep" | "switch") {
  const systemOne = vi.fn(async () => ({
    answers: {
      change: {
        choice,
        confidence: 0.9,
        probabilities: { keep: 0.05, switch: 0.05, [choice]: 0.95 },
        type: "choice",
      },
    },
  }));
  return {
    classifier: { systemOne } as unknown as ClassifierClient,
    systemOne,
  };
}

describe("resolveEffortForRun", () => {
  it("asks before a Normal turn that looks like coding runs on high", async () => {
    const resolved = await resolveEffortForRun({
      choice: "auto",
      text: CODING,
    });
    expect(resolved.offer).toEqual({
      proposed: "high",
      reason: "coding_signal",
    });
  });

  it("runs everyday Normal turns on normal without asking", async () => {
    for (const text of ["hi", "Create a contact for Acme Corp"]) {
      const resolved = await resolveEffortForRun({ choice: "auto", text });
      expect(resolved.offer).toBeUndefined();
      expect(resolved.effort).toBe("normal");
    }
  });

  it("never asks again once the person declined for this turn", async () => {
    const resolved = await resolveEffortForRun({
      choice: "normal",
      text: CODING,
    });
    expect(resolved).toMatchObject({ effort: "normal", source: "picked" });
    expect(resolved.offer).toBeUndefined();
  });

  it("keeps a thread on high until its next chapter, without asking", async () => {
    const resolved = await resolveEffortForRun({
      choice: "auto",
      text: "hi",
      threadOnHigh: true,
    });
    expect(resolved).toMatchObject({ effort: "high", source: "sticky" });
    expect(resolved.offer).toBeUndefined();
  });

  it("offers nothing on a plan without Extra, and clamps an Extra pick", async () => {
    const plan = { allowedEfforts: ["normal"] };
    expect(
      await resolveEffortForRun({ ...plan, choice: "auto", text: CODING })
    ).toEqual({ effort: "normal", source: "ceiling" });
    expect(
      (await resolveEffortForRun({ ...plan, choice: "high", text: CODING }))
        .effort
    ).toBe("normal");
  });

  it("lets the classifier decide the turns the heuristics cannot", async () => {
    const yes = classifierAnswering("switch");
    expect(
      (
        await resolveEffortForRun({
          choice: "auto",
          classifier: yes.classifier,
          text: AMBIGUOUS,
        })
      ).offer?.proposed
    ).toBe("high");

    const no = classifierAnswering("keep");
    const kept = await resolveEffortForRun({
      choice: "auto",
      classifier: no.classifier,
      text: AMBIGUOUS,
    });
    expect(kept.offer).toBeUndefined();
    expect(kept.effort).toBe("normal");
  });

  it("stays on normal when the classifier does not answer in time", async () => {
    vi.useFakeTimers();
    try {
      const systemOne = vi.fn(() => new Promise(() => undefined));
      const pending = resolveEffortForRun({
        choice: "auto",
        classifier: { systemOne } as unknown as ClassifierClient,
        text: AMBIGUOUS,
      });
      await vi.advanceTimersByTimeAsync(5000);
      const resolved = await pending;
      expect(resolved.offer).toBeUndefined();
      expect(resolved.effort).toBe("normal");
    } finally {
      vi.useRealTimers();
    }
  });

  it("runs a coding agent on its own tier without asking", async () => {
    expect(
      await resolveEffortForRun({
        agentEffort: "high",
        choice: "auto",
        text: "go ahead",
      })
    ).toEqual({ effort: "high", source: "agent" });
  });

  it("leaves the model to a Custom pin", async () => {
    expect(
      await resolveEffortForRun({
        choice: "auto",
        modelIdOverride: "anthropic/claude-opus-5",
        text: CODING,
      })
    ).toEqual({ effort: null });
  });
});
