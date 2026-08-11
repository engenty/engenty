/** @vitest-environment happy-dom */
// The drill-in behind the thread's usage totals.
//
// Two things have to hold. The entry point must exist wherever the totals do —
// unlike the prompt preview this reads recorded events, so it is NOT gated on
// developer mode. And the panel must never present cached tokens as an
// addition to the input: that is precisely the arithmetic that made the
// composer's headline read ~2× the tokens the thread moved.
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ThreadUsageEvent } from "./thread-usage-events-api.js";

const developerMode = vi.hoisted(() => ({ enabled: false }));
const usageState = vi.hoisted(() => ({
  error: null as Error | null,
  events: null as unknown,
  isLoading: false,
}));

vi.mock("../../ag-ui-inspector/ag-ui-inspector-hooks.js", () => ({
  useDeveloperModeEnabled: () => developerMode.enabled,
}));

vi.mock("./prompt-preview-api.js", () => ({
  useThreadPromptPreview: () => ({
    error: null,
    isLoading: false,
    preview: null,
  }),
}));

vi.mock("./thread-usage-events-api.js", () => ({
  useThreadUsageEvents: () => usageState,
}));

const { ContextUsagePopover } = await import("./context-usage-popover.js");
const { ThreadUsageDialog } = await import("./thread-usage-dialog.js");

const EVENTS: ThreadUsageEvent[] = [
  {
    cached_input_per_mtok_micros: 0,
    cached_tokens: 0,
    cost_micros: 4000,
    currency: "usd",
    feature: "copilot",
    id: "e1",
    input_per_mtok_micros: 0,
    input_tokens: 31_000,
    model_id: "deepseek/deepseek-v4-flash",
    occurred_at: "2026-08-11T10:00:00Z",
    output_per_mtok_micros: 0,
    output_tokens: 200,
    reasoning_per_mtok_micros: 0,
    reasoning_tokens: 0,
    run_id: "run-1",
  },
  {
    cached_input_per_mtok_micros: 0,
    cached_tokens: 60_000,
    cost_micros: 8000,
    currency: "usd",
    feature: "copilot",
    id: "e2",
    input_per_mtok_micros: 0,
    input_tokens: 66_800,
    model_id: "deepseek/deepseek-v4-flash",
    occurred_at: "2026-08-11T10:01:00Z",
    output_per_mtok_micros: 0,
    output_tokens: 289,
    reasoning_per_mtok_micros: 0,
    reasoning_tokens: 92,
    run_id: "run-2",
  },
];

const TOTALS = {
  cached_tokens: 60_000,
  cost_micros: 12_000,
  currency: "usd",
  event_count: 2,
  input_tokens: 97_800,
  output_tokens: 489,
  reasoning_tokens: 92,
};

beforeEach(() => {
  developerMode.enabled = false;
  usageState.error = null;
  usageState.events = EVENTS;
  usageState.isLoading = false;
});

afterEach(() => {
  cleanup();
});

describe("the thread-usage entry point", () => {
  it("opens from the thread total without developer mode", async () => {
    const user = userEvent.setup();
    render(
      <ContextUsagePopover contextUsage={null} threadId="t1" totals={TOTALS}>
        <button type="button">usage</button>
      </ContextUsagePopover>
    );

    await user.click(screen.getByRole("button", { name: "usage" }));
    await user.click(screen.getByRole("button", { name: "98.3k" }));
    expect(await screen.findByText("Token usage")).toBeTruthy();
  });

  it("counts input + output only in the thread total", () => {
    // 97.8k + 489 = 98.3k. The old sum added the 60k cache reads on top and
    // showed 158.4k for the same two runs.
    render(
      <ContextUsagePopover contextUsage={null} threadId="t1" totals={TOTALS}>
        <button type="button">usage</button>
      </ContextUsagePopover>
    );

    expect(screen.queryByText("158.4k")).toBeNull();
  });

  it("stays plain text when the surface has no thread", async () => {
    const user = userEvent.setup();
    render(
      <ContextUsagePopover contextUsage={null} totals={TOTALS}>
        <button type="button">usage</button>
      </ContextUsagePopover>
    );

    await user.click(screen.getByRole("button", { name: "usage" }));
    expect(screen.queryByRole("button", { name: "98.3k" })).toBeNull();
  });
});

describe("ThreadUsageDialog", () => {
  it("splits the tokens into fresh, cached and output", async () => {
    render(
      <ThreadUsageDialog onOpenChange={vi.fn()} open={true} threadId="t1" />
    );

    expect(await screen.findByText("Token usage")).toBeTruthy();
    expect(screen.getByText("Fresh input (paid per token)")).toBeTruthy();
    expect(screen.getByText("Cached input (re-read prompt)")).toBeTruthy();
    expect(screen.getByText(/98.3k tokens over 2 runs/)).toBeTruthy();
  });

  it("always explains the multiplier behind the total", async () => {
    // Without this the number reads as if the conversation itself were huge,
    // and the reader prunes the wrong thing (their own messages).
    render(
      <ThreadUsageDialog onOpenChange={vi.fn()} open={true} threadId="t1" />
    );

    await screen.findByText("Token usage");
    expect(
      screen.getByText(/Every model call re-sends the whole prompt/)
    ).toBeTruthy();
    expect(screen.getByText(/61% of the input was served/)).toBeTruthy();
  });

  it("lists runs newest first", async () => {
    render(
      <ThreadUsageDialog onOpenChange={vi.fn()} open={true} threadId="t1" />
    );

    await screen.findByText("Token usage");
    const rows = screen.getAllByText(/fresh ·/);
    expect(rows[0]?.textContent).toContain("6.8k fresh");
  });

  it("says so when nothing has been metered yet", async () => {
    usageState.events = [];
    render(
      <ThreadUsageDialog onOpenChange={vi.fn()} open={true} threadId="t1" />
    );

    expect(
      await screen.findByText("No metered runs recorded for this thread yet.")
    ).toBeTruthy();
  });
});
