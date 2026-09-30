/** @vitest-environment happy-dom */
import type { AgUiOpenInterruptMetadata } from "@engenty/ag-ui-bridge";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopilotToolCallActionsProvider } from "../interrupts/copilot-tool-call-actions.js";
import { FeedbackArtifactToolCallCard } from "./feedback-artifact-tool-call-card.js";

afterEach(() => {
  cleanup();
});

const TOOL_CALL_ID = "tc-f";

// `requestFeedback` suspends natively: a pending call has only its arguments,
// and the card it parks on lives on the open interrupt.
const input = {
  body: "Tell me what to focus on.",
  placeholder: "Your answer…",
  submitLabel: "Send",
  title: "What should I change?",
};

function openFor(toolCallId: string, title: string) {
  return {
    artifact_id: `artifact-${toolCallId}`,
    body: `Body of ${title}`,
    interrupt_id: `interrupt-${toolCallId}`,
    kind: "feedback",
    placeholder: "Your answer…",
    submit_label: "Send",
    title,
    tool_call_id: toolCallId,
  } as unknown as AgUiOpenInterruptMetadata;
}

describe("FeedbackArtifactToolCallCard", () => {
  it("restores the open question after a reload and sends the answer", async () => {
    const user = userEvent.setup();
    const respond = vi.fn();
    render(
      <CopilotToolCallActionsProvider
        openInterrupt={openFor(TOOL_CALL_ID, input.title)}
        pendingInterruptToolCallIds={new Set()}
        respond={respond}
      >
        <FeedbackArtifactToolCallCard
          input={input}
          state="running"
          toolCallId={TOOL_CALL_ID}
          toolName="requestFeedback"
        />
      </CopilotToolCallActionsProvider>
    );

    await user.type(
      screen.getByPlaceholderText("Your answer…"),
      "Focus on speed"
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(respond).toHaveBeenCalledWith(
      TOOL_CALL_ID,
      expect.objectContaining({
        artifactId: `artifact-${TOOL_CALL_ID}`,
        interruptId: `interrupt-${TOOL_CALL_ID}`,
        payload: { feedback: "Focus on speed" },
      })
    );
  });

  it("keeps an answered question and its answer visible while another question is open", () => {
    render(
      <CopilotToolCallActionsProvider
        openInterrupt={openFor("tc-other", "Which colour?")}
        pendingInterruptToolCallIds={new Set(["tc-other"])}
        respond={vi.fn()}
      >
        <FeedbackArtifactToolCallCard
          input={input}
          output="The user answered: Focus on speed"
          state="completed"
          toolCallId={TOOL_CALL_ID}
          toolName="requestFeedback"
        />
      </CopilotToolCallActionsProvider>
    );

    expect(screen.getByText("What should I change?")).toBeTruthy();
    expect(screen.getByText("Focus on speed")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("never shows the currently open question on an older unanswered row", () => {
    render(
      <CopilotToolCallActionsProvider
        openInterrupt={openFor("tc-other", "Which colour?")}
        pendingInterruptToolCallIds={new Set(["tc-other"])}
        respond={vi.fn()}
      >
        <FeedbackArtifactToolCallCard
          input={input}
          state="running"
          toolCallId={TOOL_CALL_ID}
          toolName="requestFeedback"
        />
      </CopilotToolCallActionsProvider>
    );

    expect(screen.queryByText("Which colour?")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("What should I change?")).toBeTruthy();
  });
});
