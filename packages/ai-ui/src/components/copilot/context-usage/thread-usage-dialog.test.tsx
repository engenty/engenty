/** @vitest-environment happy-dom */
// The drill-in behind the thread's usage totals. It reads recorded events, so
// it is not gated on developer mode, and it must never add cached tokens on top
// of the input they are part of.
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
});

describe("ThreadUsageDialog", () => {
  it("counts cached input as a slice of the input, not on top of it", async () => {
    render(
      <ThreadUsageDialog onOpenChange={vi.fn()} open={true} threadId="t1" />
    );

    // 97.8k input + 489 output; 60k of the input came from cache.
    expect(await screen.findByText(/98\.3k tokens over 2 runs/)).toBeTruthy();
    expect(screen.getByText(/^37\.8k ·/)).toBeTruthy();
  });
});
