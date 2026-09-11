// The AG-UI driver's usage, folded into the shape the run row expects.

//
// Billing correctness, so the arithmetic is pinned rather than eyeballed. The
// sum-vs-last distinction is the part that matters: `@ag-ui/mastra` reports one
// TokenUsage entry PER MODEL CALL, and window occupancy is the LAST call's input,
// not the sum — summing there would report a context window several times larger
// than any single call actually used.
import { describe, expect, it } from "vitest";
import { usageFromAgUiTokens } from "../run-usage.js";

const calls = [
  {
    cachedInputTokens: 4,
    inputTokens: 100,
    outputTokens: 10,
    reasoningTokens: 2,
  },
  {
    cachedInputTokens: 6,
    inputTokens: 250,
    outputTokens: 20,
    reasoningTokens: 3,
  },
];

describe("usageFromAgUiTokens", () => {
  it("sums every model call for the billed total", () => {
    expect(usageFromAgUiTokens(calls)).toEqual({
      cached: 10,
      input: 350,
      output: 30,
      reasoning: 5,
    });
  });

  it("takes only the LAST call for window occupancy", () => {
    // 250, not 350. This is the whole reason the option exists.
    expect(usageFromAgUiTokens(calls, { lastOnly: true })).toEqual({
      cached: 6,
      input: 250,
      output: 20,
      reasoning: 3,
    });
  });

  it("preserves cached ⊆ input and reasoning ⊆ output", () => {
    const total = usageFromAgUiTokens(calls);
    expect(total?.cached ?? 0).toBeLessThanOrEqual(total?.input ?? 0);
    expect(total?.reasoning ?? 0).toBeLessThanOrEqual(total?.output ?? 0);
  });

  it("returns null rather than zero when nothing was reported", () => {
    // Null and 0 are different facts on a run row: "not measured" vs "measured
    // none". Writing 0 for an unreported run would understate real spend.
    expect(usageFromAgUiTokens(null)).toBeNull();
    expect(usageFromAgUiTokens([])).toBeNull();
    expect(usageFromAgUiTokens(undefined)).toBeNull();
  });

  it("keeps a field null when no call reported it", () => {
    expect(usageFromAgUiTokens([{ inputTokens: 5 }])).toEqual({
      cached: null,
      input: 5,
      output: null,
      reasoning: null,
    });
  });

  it("skips malformed entries instead of failing the run", () => {
    expect(usageFromAgUiTokens([null, { inputTokens: 7 }, "x"])).toMatchObject({
      input: 7,
    });
  });
});
