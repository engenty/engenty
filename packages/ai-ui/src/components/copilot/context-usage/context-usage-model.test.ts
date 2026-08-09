import { describe, expect, it } from "vitest";
import {
  contextUsageCostUsd,
  contextUsageLevel,
  contextUsageRatio,
  formatContextUsageLabel,
  formatCostUsd,
  formatRunDuration,
  formatTokenCount,
  runTokenTotal,
  type ThreadContextUsage,
} from "./context-usage-model";

function usage(patch: Partial<ThreadContextUsage> = {}): ThreadContextUsage {
  return {
    completion_tokens: 714,
    context_tokens: 240_000,
    duration_ms: 18_000,
    finished_at: "2026-08-08T14:20:18.000Z",
    input_per_mtok_micros: null,
    model_display_name: "Qwen 3.6 Max",
    model_id: "alibaba/qwen-3.6-max-preview",
    output_per_mtok_micros: null,
    prompt_tokens: 116_596,
    run_id: "run-1",
    started_at: "2026-08-08T14:20:00.000Z",
    status: "completed",
    ...patch,
  };
}

describe("run totals and duration", () => {
  it("counts prompt AND completion as the run's tokens", () => {
    // The window fill is prompt_tokens alone; "tokens used" is not that.
    expect(runTokenTotal(usage())).toBe(117_310);
  });

  it("treats a missing completion count as zero", () => {
    expect(runTokenTotal(usage({ completion_tokens: null }))).toBe(116_596);
  });

  it("formats durations by magnitude", () => {
    expect(formatRunDuration(18_000)).toBe("18s");
    expect(formatRunDuration(64_000)).toBe("1m 04s");
    expect(formatRunDuration(7_860_000)).toBe("2h 11m");
    expect(formatRunDuration(499)).toBe("0s");
  });

  it("renders an unfinished run as em dash, not as zero seconds", () => {
    // A still-open run has no duration; "0s" would read as instant.
    expect(formatRunDuration(null)).toBe("—");
  });
});

describe("context usage ratio and label", () => {
  it("reports the real run that prompted this work", () => {
    // 116,596 of a 240k window — the run that cost 88 KB of tool result.
    const u = usage();
    expect(contextUsageRatio(u)).toBeCloseTo(0.4858, 4);
    expect(formatContextUsageLabel(u)).toBe("116.6k / 240.0k (49%)");
  });

  it("omits the window when the model is not in the catalog", () => {
    const u = usage({ context_tokens: null, model_id: "unknown/model" });
    expect(contextUsageRatio(u)).toBeNull();
    // No denominator invented — just what we actually measured.
    expect(formatContextUsageLabel(u)).toBe("116.6k");
  });

  it("keeps a decimal so turn-over-turn growth is visible", () => {
    expect(formatTokenCount(159_300)).toBe("159.3k");
    expect(formatTokenCount(162_800)).toBe("162.8k");
    expect(formatTokenCount(1_048_600)).toBe("1.0M");
    expect(formatTokenCount(847)).toBe("847");
  });

  it("does not let an over-window prompt push the bar past its track", () => {
    // Catalog windows go stale; a prompt CAN exceed the recorded window.
    const u = usage({ context_tokens: 100_000, prompt_tokens: 130_000 });
    expect(contextUsageRatio(u)).toBeCloseTo(1.3, 4);
    // The label still tells the truth about the overflow.
    expect(formatContextUsageLabel(u)).toBe("130.0k / 100.0k (130%)");
  });
});

describe("severity thresholds", () => {
  it("escalates as headroom disappears", () => {
    expect(contextUsageLevel(usage({ prompt_tokens: 24_000 }))).toBe("normal");
    expect(contextUsageLevel(usage({ prompt_tokens: 190_000 }))).toBe("high");
    expect(contextUsageLevel(usage({ prompt_tokens: 220_000 }))).toBe(
      "critical"
    );
  });

  it("stays neutral when no window is known", () => {
    expect(contextUsageLevel(usage({ context_tokens: null }))).toBe("normal");
  });
});

describe("cost", () => {
  it("prices a run from the per-Mtok catalog rates", () => {
    const u = usage({
      completion_tokens: 1000,
      input_per_mtok_micros: 400_000, // $0.40 / Mtok
      output_per_mtok_micros: 1_200_000, // $1.20 / Mtok
      prompt_tokens: 1_000_000,
    });
    // 1M input at $0.40 + 1k output at $1.20/M = 0.40 + 0.0012
    expect(contextUsageCostUsd(u)).toBeCloseTo(0.4012, 6);
  });

  it("returns null when the catalog carries no price", () => {
    expect(contextUsageCostUsd(usage())).toBeNull();
  });

  it("treats a missing completion count as zero output, not as no price", () => {
    const u = usage({
      completion_tokens: null,
      input_per_mtok_micros: 1_000_000,
      prompt_tokens: 500_000,
    });
    expect(contextUsageCostUsd(u)).toBeCloseTo(0.5, 6);
  });

  it("never renders a real cost as $0.0000", () => {
    expect(formatCostUsd(0.000_02)).toBe("<$0.0001");
    expect(formatCostUsd(0)).toBe("$0.0000");
    expect(formatCostUsd(0.0421)).toBe("$0.0421");
  });
});
