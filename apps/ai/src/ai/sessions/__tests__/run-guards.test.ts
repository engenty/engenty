import { describe, expect, it } from "vitest";
import {
  createEmptyReplyCompletion,
  DEFAULT_RUN_TIMEOUT_MS,
  DEFAULT_STEP_TIMEOUT_MS,
  EMPTY_REPLY_SCORER_ID,
  isRunTimeoutError,
  resolveRunTimeouts,
  withRunTimeouts,
} from "../run-guards.js";

describe("resolveRunTimeouts", () => {
  it("falls back to the defaults when nothing is set", () => {
    expect(resolveRunTimeouts({})).toEqual({
      stepMs: DEFAULT_STEP_TIMEOUT_MS,
      totalMs: DEFAULT_RUN_TIMEOUT_MS,
    });
  });

  it("reads the env caps and lets 0 switch one off", () => {
    expect(
      resolveRunTimeouts({
        ENGENTY_AI_RUN_TIMEOUT_MS: "0",
        ENGENTY_AI_STEP_TIMEOUT_MS: "45000",
      })
    ).toEqual({ stepMs: 45_000 });
  });

  it("ignores unparsable values", () => {
    expect(
      resolveRunTimeouts({ ENGENTY_AI_STEP_TIMEOUT_MS: "soon" })
    ).toMatchObject({ stepMs: DEFAULT_STEP_TIMEOUT_MS });
  });
});

describe("withRunTimeouts", () => {
  it("adds the budget under modelSettings.timeout and keeps other settings", () => {
    expect(
      withRunTimeouts({ temperature: 0.2 }, { stepMs: 10, totalMs: 20 })
    ).toEqual({ temperature: 0.2, timeout: { stepMs: 10, totalMs: 20 } });
  });

  it("lets a caller-set timeout field win", () => {
    expect(
      withRunTimeouts({ timeout: { stepMs: 5 } }, { stepMs: 10, totalMs: 20 })
    ).toEqual({ timeout: { stepMs: 5, totalMs: 20 } });
  });

  it("is a pass-through when both caps are off", () => {
    expect(withRunTimeouts(undefined, {})).toBeUndefined();
  });
});

describe("isRunTimeoutError", () => {
  it("recognises Mastra's timeout by name and by message", () => {
    expect(
      isRunTimeoutError(
        Object.assign(new Error("x"), { name: "MastraTimeoutError" })
      )
    ).toBe(true);
    expect(
      isRunTimeoutError(
        new Error(
          "Model call timed out after 1ms (modelSettings.timeout.stepMs)"
        )
      )
    ).toBe(true);
    expect(isRunTimeoutError(new Error("boom"))).toBe(false);
  });
});

describe("createEmptyReplyCompletion", () => {
  const runScorer = async (
    completion: ReturnType<typeof createEmptyReplyCompletion>,
    output: string
  ) =>
    (
      completion.scorers[0] as unknown as {
        run: (input: { output: string }) => Promise<{ score: number }>;
      }
    ).run({ output });

  it("is complete as soon as the model wrote text", async () => {
    const completion = createEmptyReplyCompletion();
    expect(completion.scorers[0]?.id).toBe(EMPTY_REPLY_SCORER_ID);
    await expect(runScorer(completion, "done")).resolves.toMatchObject({
      score: 1,
    });
  });

  it("pushes back on a silent step once, then lets the run end", async () => {
    const completion = createEmptyReplyCompletion();
    await expect(runScorer(completion, "")).resolves.toMatchObject({
      score: 0,
    });
    await expect(runScorer(completion, "   ")).resolves.toMatchObject({
      score: 1,
    });
  });
});
