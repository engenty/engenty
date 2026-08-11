import { describe, expect, it } from "vitest";
import {
  formatCompactTokenCount,
  formatCopilotUsageLine,
  formatUsageCostMicros,
  freshInputTokens,
  sumThreadUsageTokens,
} from "./format-thread-usage.js";

describe("format-session-usage", () => {
  it("formats token counts compactly", () => {
    expect(formatCompactTokenCount(0)).toBe("0");
    expect(formatCompactTokenCount(842)).toBe("842");
    expect(formatCompactTokenCount(12_400)).toBe("12k");
    expect(formatCompactTokenCount(1_250_000)).toBe("1.3M");
  });

  it("formats USD cost from micros", () => {
    expect(formatUsageCostMicros(0)).toBeNull();
    expect(formatUsageCostMicros(12_500)).toBe("$0.0125");
  });

  it("builds the composer usage line", () => {
    expect(
      formatCopilotUsageLine({
        tokenLabel: "1.2k tokens",
        costLabel: "$0.0042",
      })
    ).toBe("1.2k tokens · $0.0042");
    expect(
      formatCopilotUsageLine({
        tokenLabel: "0 tokens",
        costLabel: null,
      })
    ).toBe("0 tokens");
  });

  it("sums input and output only — cached and reasoning are slices of those", () => {
    // Adding them back double-counted: a cache-heavy thread reported nearly
    // twice the tokens it actually moved.
    expect(
      sumThreadUsageTokens({
        cached_tokens: 10,
        cost_micros: 100,
        currency: "usd",
        event_count: 1,
        input_tokens: 100,
        output_tokens: 50,
        reasoning_tokens: 5,
      })
    ).toBe(150);
  });

  it("reports the uncached part of the input", () => {
    expect(
      freshInputTokens({
        cached_tokens: 70,
        cost_micros: 100,
        currency: "usd",
        event_count: 1,
        input_tokens: 100,
        output_tokens: 50,
        reasoning_tokens: 5,
      })
    ).toBe(30);
  });
});
