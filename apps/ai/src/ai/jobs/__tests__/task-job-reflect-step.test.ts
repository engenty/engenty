// Reflect step contract: env-gated off by default, pass-through on skip,
// fail-open when the delegated run cannot even be constructed, and a
// save-averse reflection prompt.

import { afterEach, describe, expect, it } from "vitest";
import {
  buildReflectionPrompt,
  isMemoryReflectionEnabled,
  reflectStep,
} from "../task-job-reflect-step.js";

const envelope = {
  agent_type_key: "contacts.manager",
  brief: "# Task T-1: Do the thing",
  result_text: "Done.",
  status: "ran" as const,
  task_id: "11111111-1111-4111-8111-111111111111",
  tenant_id: "22222222-2222-4222-8222-222222222222",
};

afterEach(() => {
  delete process.env.ENGENTY_AI_MEMORY_REFLECTION;
});

describe("reflect step", () => {
  it("is disabled unless ENGENTY_AI_MEMORY_REFLECTION=true", () => {
    expect(isMemoryReflectionEnabled()).toBe(false);
    process.env.ENGENTY_AI_MEMORY_REFLECTION = "false";
    expect(isMemoryReflectionEnabled()).toBe(false);
    process.env.ENGENTY_AI_MEMORY_REFLECTION = "true";
    expect(isMemoryReflectionEnabled()).toBe(true);
  });

  it("passes the envelope through untouched when disabled", async () => {
    const result = await reflectStep.execute({
      inputData: envelope,
      runId: "run-1",
    } as never);
    expect(result).toEqual(envelope);
  });

  it("passes through skipped envelopes without reflecting", async () => {
    process.env.ENGENTY_AI_MEMORY_REFLECTION = "true";
    const skipped = { ...envelope, status: "skipped" as const };
    const result = await reflectStep.execute({
      inputData: skipped,
      runId: "run-1",
    } as never);
    expect(result).toEqual(skipped);
  });

  it("fails open when the runtime is not configured", async () => {
    process.env.ENGENTY_AI_MEMORY_REFLECTION = "true";
    // No agent-session store / core env in the test process: the step must
    // swallow the setup failure and return the envelope unchanged.
    const result = await reflectStep.execute({
      inputData: envelope,
      runId: "run-1",
    } as never);
    expect(result).toEqual(envelope);
  });
});

describe("buildReflectionPrompt", () => {
  it("carries brief + outcome and biases against saving", () => {
    const prompt = buildReflectionPrompt(envelope);
    expect(prompt).toContain("outcome: completed");
    expect(prompt).toContain("Do the thing");
    expect(prompt).toContain("NOTHING");
    expect(prompt).toContain("source_kind 'reflection'");
  });

  it("marks failed runs as FAILED", () => {
    const prompt = buildReflectionPrompt({ ...envelope, status: "failed" });
    expect(prompt).toContain("outcome: FAILED");
  });

  it("truncates oversized briefs", () => {
    const prompt = buildReflectionPrompt({
      ...envelope,
      brief: "y".repeat(10_000),
      result_text: "z".repeat(10_000),
    });
    expect(prompt.length).toBeLessThan(5000);
  });
});
