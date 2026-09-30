import { describe, expect, it } from "vitest";
import {
  contextUsageCostUsd,
  formatCostUsd,
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
