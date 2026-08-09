/** @vitest-environment happy-dom */
import type { AgUiOpenInterruptMetadata } from "@engenty/ag-ui-bridge";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CopilotOpenInterruptBanner,
  hasRenderableOpenInterrupt,
} from "./copilot-open-interrupt-banner.js";

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

describe("hasRenderableOpenInterrupt", () => {
  const asOpen = (value: unknown) => value as AgUiOpenInterruptMetadata;

  it("is true for the interrupts the banner has a card for", () => {
    expect(
      hasRenderableOpenInterrupt(
        asOpen({
          artifact_id: "a1",
          body: "b",
          interrupt_id: "a1",
          kind: "feedback",
          title: "t",
          tool_call_id: "tc-1",
        })
      )
    ).toBe(true);
    expect(
      hasRenderableOpenInterrupt(
        asOpen({
          artifact_id: "a2",
          choices: [{ id: "red", label: "Rot" }],
          interrupt_id: "a2",
          title: "Farbe",
          tool_call_id: "tc-2",
        })
      )
    ).toBe(true);
  });

  it("is false when the banner would render nothing", () => {
    // Callers gate the composer status flap on the element being non-null, so
    // an unrenderable interrupt used to slide the flap open around empty space.
    expect(
      hasRenderableOpenInterrupt(
        asOpen({
          interrupt_id: "i1",
          kind: "frontend_tool",
          tool_call_id: "tc-3",
          tool_name: "navigate",
        })
      )
    ).toBe(false);
    expect(
      hasRenderableOpenInterrupt(
        asOpen({
          artifact_id: "a3",
          choices: [],
          interrupt_id: "a3",
          title: "No options",
          tool_call_id: "tc-4",
        })
      )
    ).toBe(false);
  });
});
