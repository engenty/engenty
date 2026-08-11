import { describe, expect, it } from "vitest";
import type { ThreadUsageEvent } from "./thread-usage-events-api.js";
import {
  cacheHitRatio,
  largestRunInputTokens,
  summarizeUsageEvents,
} from "./thread-usage-model.js";

function event(overrides: Partial<ThreadUsageEvent> = {}): ThreadUsageEvent {
  return {
    cached_input_per_mtok_micros: 0,
    cached_tokens: 0,
    cost_micros: 0,
    currency: "usd",
    feature: "copilot",
    id: crypto.randomUUID(),
    input_per_mtok_micros: 0,
    input_tokens: 0,
    model_id: "deepseek/deepseek-v4-flash",
    occurred_at: "2026-08-11T10:00:00Z",
    output_per_mtok_micros: 0,
    output_tokens: 0,
    reasoning_per_mtok_micros: 0,
    reasoning_tokens: 0,
    run_id: null,
    ...overrides,
  };
}

describe("summarizeUsageEvents", () => {
  it("treats cached and reasoning as slices, not extra dimensions", () => {
    // The whole reason the panel exists: input + output + cached + reasoning
    // reported a 150-token thread as 250.
    const summary = summarizeUsageEvents([
      event({
        cached_tokens: 70,
        input_tokens: 100,
        output_tokens: 50,
        reasoning_tokens: 30,
      }),
    ]);

    expect(summary.totalTokens).toBe(150);
    expect(summary.freshInputTokens).toBe(30);
    expect(summary.cachedTokens).toBe(70);
    expect(summary.reasoningTokens).toBe(30);
  });

  it("accumulates across runs and keeps the currency", () => {
    const summary = summarizeUsageEvents([
      event({ cost_micros: 1200, currency: "usd", input_tokens: 30_000 }),
      event({ cost_micros: 800, currency: "usd", input_tokens: 32_000 }),
    ]);

    expect(summary.callCount).toBe(2);
    expect(summary.inputTokens).toBe(62_000);
    expect(summary.costMicros).toBe(2000);
    expect(summary.currency).toBe("usd");
  });

  it("lists models most-used first", () => {
    const summary = summarizeUsageEvents([
      event({ model_id: "b" }),
      event({ model_id: "a" }),
      event({ model_id: "a" }),
    ]);

    expect(summary.modelIds).toEqual(["a", "b"]);
  });

  it("never reports negative fresh input when cache exceeds input", () => {
    // Defensive: a provider that reports cache reads outside `inputTokens`
    // would otherwise render a negative bar segment.
    const summary = summarizeUsageEvents([
      event({ cached_tokens: 500, input_tokens: 100 }),
    ]);

    expect(summary.freshInputTokens).toBe(0);
  });
});

describe("cacheHitRatio", () => {
  it("is the cached share of input", () => {
    const summary = summarizeUsageEvents([
      event({ cached_tokens: 75, input_tokens: 100 }),
    ]);

    expect(cacheHitRatio(summary)).toBeCloseTo(0.75);
  });

  it("is null with no input recorded", () => {
    expect(cacheHitRatio(summarizeUsageEvents([]))).toBeNull();
  });
});

describe("largestRunInputTokens", () => {
  it("reports the heaviest single run", () => {
    expect(
      largestRunInputTokens([
        event({ input_tokens: 30_000 }),
        event({ input_tokens: 64_000 }),
      ])
    ).toBe(64_000);
  });
});
