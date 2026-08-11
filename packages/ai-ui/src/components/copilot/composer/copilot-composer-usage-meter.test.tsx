/** @vitest-environment happy-dom */
// The composer's usage line has three states, and the one that shipped wrong
// was the first one a user ever sees: a brand-new thread reports a ZEROED usage
// summary (not null), so the line rendered a naked "0" with no ring and no
// duration next to it — indistinguishable from a broken meter.
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const usageState = vi.hoisted(() => ({
  contextUsage: null as unknown,
  totals: null as unknown,
}));

vi.mock("@engenty/i18n/ui", () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      key === "copilot.usage.tokens" ? `${vars?.value} tokens` : key,
  }),
}));

vi.mock("../../../ag-ui/thread-usage/use-copilot-thread-usage.js", () => ({
  useCopilotThreadUsage: () => ({ usage: usageState.totals }),
}));

vi.mock("../context-usage/context-usage-api.js", () => ({
  useCopilotContextUsage: () => ({ usage: usageState.contextUsage }),
}));

vi.mock("../context-usage/context-usage-popover.js", () => ({
  ContextUsagePopover: ({ children }: { children: React.ReactNode }) =>
    children,
}));

const { CopilotComposerUsageMeter } = await import(
  "./copilot-composer-usage-meter.js"
);
const { clearLiveRunUsage, publishLiveRunUsage } = await import(
  "../../../ag-ui/thread-usage/live-run-usage.js"
);

const EMPTY_TOTALS = {
  cached_tokens: 0,
  cost_micros: 0,
  currency: "usd",
  event_count: 0,
  input_tokens: 0,
  output_tokens: 0,
  reasoning_tokens: 0,
};

/** The line is several spans; read the whole control. */
function lineText(): string {
  return (
    screen.getByRole("button", { name: "Token usage details" }).textContent ??
    ""
  );
}

beforeEach(() => {
  usageState.contextUsage = null;
  usageState.totals = EMPTY_TOTALS;
});

afterEach(() => {
  cleanup();
  clearLiveRunUsage("t1");
  vi.useRealTimers();
});

describe("CopilotComposerUsageMeter", () => {
  it("shows the empty gauge instead of a naked 0 on a fresh thread", () => {
    render(<CopilotComposerUsageMeter chatStatus="ready" threadId="t1" />);

    expect(screen.queryByText("0")).toBeNull();
    expect(screen.getByLabelText("No token usage recorded yet")).toBeTruthy();
  });

  it("counts up while the turn is running", () => {
    vi.useFakeTimers();
    // The live figure comes off the stream, NOT from the thread total — the
    // recorded totals do not move until the run is over.
    publishLiveRunUsage("t1", {
      cached_tokens: 1800,
      input_tokens: 2350,
      output_tokens: 50,
      reasoning_tokens: 0,
    });
    render(<CopilotComposerUsageMeter chatStatus="streaming" threadId="t1" />);

    // The server writes duration_ms only when the run finishes, so this clock
    // is the only elapsed number that exists mid-turn.
    expect(lineText()).toContain("0s");
    act(() => {
      vi.advanceTimersByTime(151_000);
    });
    expect(lineText()).toContain("2m 31s · 2.4k tokens");
  });

  it("returns to the recorded numbers once the run settles", () => {
    usageState.totals = { ...EMPTY_TOTALS, input_tokens: 97_800 };
    usageState.contextUsage = {
      completion_tokens: 106,
      context_tokens: 1_000_000,
      duration_ms: 10_000,
      finished_at: "2026-08-11T10:00:10Z",
      input_per_mtok_micros: null,
      model_display_name: null,
      model_id: "deepseek/deepseek-v4-flash",
      output_per_mtok_micros: null,
      prompt_tokens: 31_200,
      run_id: "r1",
      started_at: "2026-08-11T10:00:00Z",
      status: "completed",
    };
    render(<CopilotComposerUsageMeter chatStatus="ready" threadId="t1" />);

    expect(lineText()).toContain("31.3k / 97.8k · 10s");
  });

  it("renders nothing without a thread", () => {
    const { container } = render(
      <CopilotComposerUsageMeter chatStatus="ready" threadId={null} />
    );
    expect(container.firstChild).toBeNull();
  });
});
