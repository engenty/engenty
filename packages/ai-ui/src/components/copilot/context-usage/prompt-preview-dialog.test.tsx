/** @vitest-environment happy-dom */
// The developer drill-in behind the composer's prompt number.
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const developerMode = vi.hoisted(() => ({ enabled: true }));
const previewState = vi.hoisted(() => ({
  error: null as Error | null,
  isLoading: false,
  preview: null as unknown,
}));

vi.mock("../../ag-ui-inspector/ag-ui-inspector-hooks.js", () => ({
  useDeveloperModeEnabled: () => developerMode.enabled,
}));

vi.mock("./prompt-preview-api.js", () => ({
  useThreadPromptPreview: () => previewState,
}));

// The popover also mounts the thread-usage drill-in, whose hook reaches for the
// EngentyAI provider this test does not stand up.
vi.mock("./thread-usage-events-api.js", () => ({
  useThreadUsageEvents: () => ({ error: null, events: null, isLoading: false }),
}));

const { ContextUsagePopover } = await import("./context-usage-popover.js");

const CONTEXT_USAGE = {
  completion_tokens: 190,
  context_tokens: 1_000_000,
  duration_ms: 15_000,
  finished_at: null,
  input_per_mtok_micros: null,
  model_display_name: "DeepSeek V4 Pro",
  model_id: "deepseek/deepseek-v4-pro",
  output_per_mtok_micros: null,
  prompt_tokens: 29_900,
  run_id: "run-1",
  started_at: "2026-08-09T12:00:00Z",
  status: "completed",
};

beforeEach(() => {
  developerMode.enabled = true;
  previewState.error = null;
  previewState.isLoading = false;
});

afterEach(() => {
  cleanup();
});

describe("the prompt drill-in entry point", () => {
  it("leaves it as plain text outside developer mode", async () => {
    // The endpoint 404s outside a development build; offering the link there
    // would send the reader into an error dialog for a route that is absent by
    // design.
    developerMode.enabled = false;
    const user = userEvent.setup();
    render(
      <ContextUsagePopover
        contextUsage={CONTEXT_USAGE}
        threadId="thread-1"
        totals={null}
      >
        <button type="button">usage</button>
      </ContextUsagePopover>
    );

    await user.click(screen.getByRole("button", { name: "usage" }));
    expect(screen.getByText("29.9k")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "29.9k" })).toBeNull();
  });

  it("survives the popover closing under it", async () => {
    // The click that opens the dialog also closes the popover; the dialog must
    // not unmount with it.
    const user = userEvent.setup();
    render(
      <ContextUsagePopover
        contextUsage={CONTEXT_USAGE}
        threadId="thread-1"
        totals={null}
      >
        <button type="button">usage</button>
      </ContextUsagePopover>
    );

    await user.click(screen.getByRole("button", { name: "usage" }));
    await user.click(screen.getByRole("button", { name: "29.9k" }));
    expect(await screen.findByText("Prompt breakdown")).toBeTruthy();
  });
});
