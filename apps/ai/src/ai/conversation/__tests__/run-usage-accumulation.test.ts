// Metering vs. context occupancy: two different numbers from the same stream.
//
// Mastra's AgentController emits `usage_update` once per `step-finish`, carrying
// THAT step's usage. Reading the last one as the run total billed a five-step
// turn as a single call; summing them and calling the result "context window
// usage" over-stated the window by the same factor. The bridge now tracks both.
import { describe, expect, it } from "vitest";
import { accumulateSessionUsage, usageFromSession } from "../run-usage.js";
import { SessionAgUiConverter } from "../session-agui-bridge.js";

function usageUpdate(promptTokens: number, completionTokens: number) {
  return {
    type: "usage_update" as const,
    usage: { completionTokens, promptTokens },
  };
}

describe("accumulateSessionUsage", () => {
  it("sums per-step payloads", () => {
    let total: unknown = null;
    total = accumulateSessionUsage(total, {
      completionTokens: 10,
      promptTokens: 1000,
    });
    total = accumulateSessionUsage(total, {
      completionTokens: 20,
      promptTokens: 1200,
    });

    expect(usageFromSession(total)).toMatchObject({
      input: 2200,
      output: 30,
    });
  });

  it("ignores payloads it cannot read", () => {
    const total = accumulateSessionUsage(
      { completionTokens: 5, promptTokens: 100 },
      null
    );
    expect(usageFromSession(total)).toMatchObject({ input: 100, output: 5 });
  });

  it("keeps a missing dimension null rather than inventing a zero", () => {
    const total = accumulateSessionUsage(null, { promptTokens: 100 });
    expect(usageFromSession(total)?.reasoning).toBeNull();
  });
});

describe("SessionAgUiConverter usage", () => {
  it("reports the last step for the window and the sum for billing", () => {
    const converter = new SessionAgUiConverter();
    converter.convert(usageUpdate(30_000, 100));
    converter.convert(usageUpdate(31_500, 120));
    converter.convert(usageUpdate(33_000, 90));

    // What the run is billed on.
    expect(usageFromSession(converter.totalUsage)).toMatchObject({
      input: 94_500,
      output: 310,
    });
    // How full the window actually got — the prompt of the final step.
    expect(usageFromSession(converter.lastUsage)).toMatchObject({
      input: 33_000,
    });
  });

  it("leaves both null when no usage ever arrived", () => {
    const converter = new SessionAgUiConverter();
    expect(converter.totalUsage).toBeNull();
    expect(converter.lastUsage).toBeNull();
  });
});
