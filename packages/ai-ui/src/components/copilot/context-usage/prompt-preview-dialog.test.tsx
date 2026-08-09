/** @vitest-environment happy-dom */
// The developer drill-in behind the composer's prompt number.
//
// Two things have to hold or the panel misleads: the entry point must not exist
// outside developer mode (the route 404s there, so the link would dead-end), and
// the caveats must always be on screen — they are the only thing stopping a
// reader from treating a deliberately partial reconstruction as the exact prompt
// the meter is reporting.
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ThreadPromptPreview } from "./prompt-preview-api.js";

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

const { ContextUsagePopover } = await import("./context-usage-popover.js");
const { PromptPreviewDialog } = await import("./prompt-preview-dialog.js");

const PREVIEW: ThreadPromptPreview = {
  agent_id: "engenty.copilot",
  caveats: ["Reconstructed for the NEXT run on this thread"],
  messages: [
    {
      chars: 400,
      estimated_tokens: 100,
      id: "m1",
      role: "user",
      text: "lass mich wählen",
      text_truncated: false,
    },
  ],
  model_id: "deepseek/deepseek-v4-flash",
  recalled_tokens: null,
  system: { chars: 18_305, estimated_tokens: 4576, text: "SOUL + AGENTS" },
  tools: [
    {
      chars: 2056,
      description: "Render UI",
      estimated_tokens: 514,
      name: "show_ui",
      schema_chars: 770,
      schema_source: "ai-sdk",
    },
    {
      chars: 563,
      description: "Ask the user to choose",
      estimated_tokens: 141,
      name: "requestDecision",
      schema_chars: 300,
      schema_source: "ai-sdk",
    },
  ],
  totals: {
    chars: 61_801,
    estimated_tokens: 15_450,
    message_chars: 6842,
    system_chars: 18_305,
    tool_chars: 36_654,
  },
};

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
  previewState.preview = PREVIEW;
});

afterEach(() => {
  cleanup();
});

describe("the prompt drill-in entry point", () => {
  it("makes the Prompt number a button in developer mode", async () => {
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
    expect(screen.getByRole("button", { name: "29.9k" })).toBeTruthy();
  });

  it("leaves it as plain text outside developer mode", () => {
    // The endpoint 404s outside a development build; offering the link there
    // would send the reader into an error dialog for a route that is absent by
    // design.
    developerMode.enabled = false;
    render(
      <ContextUsagePopover
        contextUsage={CONTEXT_USAGE}
        threadId="thread-1"
        totals={null}
      >
        <button type="button">usage</button>
      </ContextUsagePopover>
    );

    expect(screen.queryByRole("button", { name: "29.9k" })).toBeNull();
  });

  it("leaves it as plain text when the surface has no thread", () => {
    render(
      <ContextUsagePopover contextUsage={CONTEXT_USAGE} totals={null}>
        <button type="button">usage</button>
      </ContextUsagePopover>
    );

    expect(screen.queryByRole("button", { name: "29.9k" })).toBeNull();
  });

  it("survives the popover closing under it", async () => {
    // The dialog is a SIBLING of the popover: rendered inside `PopoverContent`
    // it would unmount on the same click that opens it.
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

describe("PromptPreviewDialog", () => {
  it("leads with the section split, not just the total", async () => {
    render(
      <PromptPreviewDialog
        onOpenChange={vi.fn()}
        open={true}
        threadId="thread-1"
      />
    );

    expect(await screen.findByText("Prompt breakdown")).toBeTruthy();
    expect(screen.getByText("System instructions")).toBeTruthy();
    expect(screen.getByText("Tool definitions (2)")).toBeTruthy();
    expect(screen.getByText("Recalled history (1 messages)")).toBeTruthy();
  });

  it("lists tools heaviest first", async () => {
    render(
      <PromptPreviewDialog
        onOpenChange={vi.fn()}
        open={true}
        threadId="thread-1"
      />
    );

    await screen.findByText("Prompt breakdown");
    const names = screen
      .getAllByText(/^(show_ui|requestDecision)$/)
      .map((node) => node.textContent);
    expect(names).toEqual(["show_ui", "requestDecision"]);
  });

  it("always shows what the reconstruction leaves out", async () => {
    render(
      <PromptPreviewDialog
        onOpenChange={vi.fn()}
        open={true}
        threadId="thread-1"
      />
    );

    expect(
      await screen.findByText("Reconstructed for the NEXT run on this thread")
    ).toBeTruthy();
  });

  it("reports a failure instead of rendering an empty breakdown", async () => {
    previewState.preview = null;
    previewState.error = new Error("agent_threads.notFound");
    render(
      <PromptPreviewDialog
        onOpenChange={vi.fn()}
        open={true}
        threadId="thread-1"
      />
    );

    expect(await screen.findByText(/agent_threads\.notFound/)).toBeTruthy();
  });
});
