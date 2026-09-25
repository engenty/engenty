import type { ClassifierClient } from "@engenty/typesafe-client";
import { describe, expect, it, vi } from "vitest";
import {
  resolveAutoEffort,
  resolveEffortForRun,
} from "../resolve-auto-effort.js";

describe("resolveAutoEffort", () => {
  it("sizes coding asks high", async () => {
    expect(
      await resolveAutoEffort({ text: "Refactor the auth module across files" })
    ).toMatchObject({ effort: "high", source: "heuristic" });
  });

  it("sizes tool-shaped asks medium", async () => {
    expect(
      await resolveAutoEffort({ text: "Create a contact for Acme Corp" })
    ).toMatchObject({ effort: "medium", source: "heuristic" });
  });

  it("sizes greetings low", async () => {
    expect(await resolveAutoEffort({ text: "hi" })).toMatchObject({
      effort: "low",
      source: "heuristic",
    });
  });

  it("clamps the guess to the plan grant", async () => {
    expect(
      await resolveAutoEffort({
        allowedEfforts: ["low", "medium"],
        text: "Refactor the auth module across files",
      })
    ).toMatchObject({ effort: "medium" });
  });

  it("short-circuits when the plan only grants one tier", async () => {
    expect(
      await resolveAutoEffort({ allowedEfforts: ["medium"], text: "hi" })
    ).toMatchObject({ effort: "medium", source: "ceiling" });
  });
});

describe("resolveEffortForRun", () => {
  it("passes explicit picks through (clamped)", async () => {
    expect(
      await resolveEffortForRun({
        allowedEfforts: ["low", "medium"],
        choice: "high",
        text: "whatever",
      })
    ).toEqual({ autoResolved: false, effort: "medium" });
  });

  it("skips Auto when an expert model pin is set", async () => {
    expect(
      await resolveEffortForRun({
        choice: "auto",
        modelIdOverride: "openai/gpt-5",
        text: "Refactor everything",
      })
    ).toEqual({ autoResolved: false, effort: null });
  });

  it("sizes Auto turns", async () => {
    expect(
      await resolveEffortForRun({ choice: "auto", text: "hi" })
    ).toMatchObject({
      autoResolved: true,
      effort: "low",
    });
  });
});

describe("resolveAutoEffort tier changes", () => {
  const coding = "Refactor the auth module across files";
  const minutesAgo = (minutes: number) =>
    new Date(Date.now() - minutes * 60_000).toISOString();
  const answering = (choice: "keep" | "switch") => {
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
  };

  it("keeps the thread's tier when the classifier declines inside the cache window", async () => {
    const { classifier } = answering("keep");
    expect(
      await resolveAutoEffort({
        classifier,
        previous: { at: minutesAgo(1), effort: "low" },
        text: coding,
      })
    ).toMatchObject({ effort: "low", source: "classifier" });
  });

  it("switches when the classifier approves inside the cache window", async () => {
    const { classifier } = answering("switch");
    expect(
      await resolveAutoEffort({
        classifier,
        previous: { at: minutesAgo(1), effort: "low" },
        text: coding,
      })
    ).toMatchObject({ effort: "high", source: "classifier" });
  });

  it("switches without asking once the cache has gone cold", async () => {
    const { classifier, systemOne } = answering("keep");
    expect(
      await resolveAutoEffort({
        classifier,
        previous: { at: minutesAgo(30), effort: "low" },
        text: coding,
      })
    ).toMatchObject({ effort: "high", source: "heuristic" });
    expect(systemOne).not.toHaveBeenCalled();
  });

  it("keeps the thread's tier when the classifier does not answer in time", async () => {
    vi.useFakeTimers();
    try {
      const systemOne = vi.fn(() => new Promise(() => undefined));
      const pending = resolveAutoEffort({
        classifier: { systemOne } as unknown as ClassifierClient,
        previous: { at: minutesAgo(1), effort: "low" },
        text: coding,
      });
      await vi.advanceTimersByTimeAsync(5000);
      expect(await pending).toMatchObject({ effort: "low" });
    } finally {
      vi.useRealTimers();
    }
  });
});
