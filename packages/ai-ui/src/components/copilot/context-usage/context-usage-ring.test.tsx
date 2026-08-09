/**
 * @vitest-environment happy-dom
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ThreadContextUsage } from "./context-usage-model";
import { ContextUsageRing } from "./context-usage-ring";

function usage(patch: Partial<ThreadContextUsage> = {}): ThreadContextUsage {
  return {
    completion_tokens: 1224,
    context_tokens: 240_000,
    duration_ms: 18_000,
    finished_at: "2026-08-08T14:20:18.000Z",
    input_per_mtok_micros: null,
    model_display_name: "Qwen 3.6 Max",
    model_id: "alibaba/qwen-3.6-max-preview",
    output_per_mtok_micros: null,
    prompt_tokens: 148_078,
    run_id: "run-1",
    started_at: "2026-08-08T14:20:00.000Z",
    status: "completed",
    ...patch,
  };
}

const CIRCUMFERENCE = 2 * Math.PI * 6;

function arcLength(container: HTMLElement): number {
  const arc = container.querySelectorAll("circle")[1];
  const [filled] = (
    arc?.getAttribute("strokeDasharray") ??
    arc?.getAttribute("stroke-dasharray") ??
    "0 0"
  )
    .split(" ")
    .map(Number);
  return filled ?? 0;
}

afterEach(cleanup);

describe("ContextUsageRing", () => {
  it("fills the arc in proportion to the window used", () => {
    const { container } = render(<ContextUsageRing usage={usage()} />);
    // 148,078 / 240,000 = 61.7%
    expect(arcLength(container)).toBeCloseTo(CIRCUMFERENCE * 0.617, 1);
  });

  it("renders nothing when the window is unknown", () => {
    // No denominator → a ring would either sit empty or invent one.
    const { container } = render(
      <ContextUsageRing usage={usage({ context_tokens: null })} />
    );
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders nothing without usage", () => {
    const { container } = render(<ContextUsageRing usage={null} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("caps the arc at a full circle when the prompt exceeds the window", () => {
    // An arc longer than the circumference wraps and reads as LESS full.
    const { container } = render(
      <ContextUsageRing
        usage={usage({ context_tokens: 100_000, prompt_tokens: 130_000 })}
      />
    );
    expect(arcLength(container)).toBeCloseTo(CIRCUMFERENCE, 5);
  });

  it("names the fill for screen readers", () => {
    const { container } = render(<ContextUsageRing usage={usage()} />);
    expect(container.querySelector("svg")?.getAttribute("aria-label")).toBe(
      "Context window 148.1k / 240.0k (62%)"
    );
  });
});
