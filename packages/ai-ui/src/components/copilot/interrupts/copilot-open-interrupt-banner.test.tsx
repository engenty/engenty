/** @vitest-environment happy-dom */
import type { AgUiOpenInterruptMetadata } from "@engenty/ag-ui-bridge";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopilotOpenInterruptBanner } from "./copilot-open-interrupt-banner.js";

afterEach(() => {
  cleanup();
});

const noop = () => {};

describe("CopilotOpenInterruptBanner feedback", () => {
  const feedbackOpen = {
    artifact_id: "artifact-1",
    body: "Tell me what to focus on.",
    interrupt_id: "artifact-1",
    kind: "feedback",
    placeholder: "Your answer…",
    submit_label: "Send",
    title: "What should I change?",
    tool_call_id: "tc-1",
  } as unknown as AgUiOpenInterruptMetadata;

  it("renders the feedback card and submits typed text", async () => {
    const onFeedbackSubmit = vi.fn();
    render(
      <CopilotOpenInterruptBanner
        onDecisionChoose={noop}
        onFeedbackSubmit={onFeedbackSubmit}
        onFrontendToolApprove={noop}
        onFrontendToolReject={noop}
        open={feedbackOpen}
      />
    );

    expect(screen.getByText("What should I change?")).toBeTruthy();
    const textarea = screen.getByPlaceholderText("Your answer…");
    await userEvent.type(textarea, "Focus on speed");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(onFeedbackSubmit).toHaveBeenCalledWith(
      "artifact-1",
      "Focus on speed",
      "artifact-1"
    );
  });
});
