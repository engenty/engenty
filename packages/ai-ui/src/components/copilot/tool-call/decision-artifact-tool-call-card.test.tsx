/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopilotToolCallActionsProvider } from "../interrupts/copilot-tool-call-actions.js";
import { DecisionArtifactToolCallCard } from "./decision-artifact-tool-call-card.js";

afterEach(() => {
  cleanup();
});

const TOOL_CALL_ID = "tc-1";

const artifactOutput = {
  artifact_id: "artifact-1",
  artifact_type: "decision",
  body: "Pick one entry to keep.",
  choices: [
    { id: "a", label: "Keep entry A" },
    { id: "b", label: "Keep entry B" },
  ],
  interrupt_id: "artifact-1",
  title: "Which entry should I keep?",
};

describe("DecisionArtifactToolCallCard", () => {
  it("shows choice buttons while the tool call is in the pending set (executing)", () => {
    render(
      <CopilotToolCallActionsProvider
        pendingInterruptToolCallIds={new Set([TOOL_CALL_ID])}
        respond={vi.fn()}
      >
        <DecisionArtifactToolCallCard
          output={artifactOutput}
          state="completed"
          toolCallId={TOOL_CALL_ID}
          toolName="requestDecision"
        />
      </CopilotToolCallActionsProvider>
    );

    expect(screen.getByRole("button", { name: "Keep entry A" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Keep entry B" })).toBeTruthy();
  });

  it("collapses to the selected choice when the output carries a resolution", () => {
    render(
      <CopilotToolCallActionsProvider respond={vi.fn()}>
        <DecisionArtifactToolCallCard
          output={{
            ...artifactOutput,
            choice_id: "a",
            choice_label: "Keep entry A",
          }}
          state="completed"
          toolCallId={TOOL_CALL_ID}
          toolName="requestDecision"
        />
      </CopilotToolCallActionsProvider>
    );

    expect(screen.queryByRole("button", { name: "Keep entry A" })).toBeNull();
    expect(screen.getByText("Keep entry A")).toBeTruthy();
    expect(screen.getByText("Which entry should I keep?")).toBeTruthy();
  });

  it("collapses optimistically when an optimistic result is present", () => {
    render(
      <CopilotToolCallActionsProvider
        optimisticInterruptResults={{ [TOOL_CALL_ID]: "Keep entry B" }}
        pendingInterruptToolCallIds={new Set()}
        respond={vi.fn()}
      >
        <DecisionArtifactToolCallCard
          output={artifactOutput}
          state="completed"
          toolCallId={TOOL_CALL_ID}
          toolName="requestDecision"
        />
      </CopilotToolCallActionsProvider>
    );

    expect(screen.queryByRole("button", { name: "Keep entry A" })).toBeNull();
    expect(screen.getByText("Keep entry B")).toBeTruthy();
  });

  it("hydrates choice buttons from open interrupt when transcript output lacks choices", () => {
    render(
      <CopilotToolCallActionsProvider
        openInterrupt={{
          artifact_id: "artifact-1",
          body: artifactOutput.body,
          choices: artifactOutput.choices,
          interrupt_id: "artifact-1",
          kind: "decision",
          title: artifactOutput.title,
          tool_call_id: TOOL_CALL_ID,
        }}
        pendingInterruptToolCallIds={new Set([TOOL_CALL_ID])}
        respond={vi.fn()}
      >
        <DecisionArtifactToolCallCard
          output={{
            artifact_id: "artifact-1",
            artifact_type: "decision",
            interrupt_id: "artifact-1",
            title: artifactOutput.title,
          }}
          state="completed"
          toolCallId={TOOL_CALL_ID}
          toolName="requestDecision"
        />
      </CopilotToolCallActionsProvider>
    );

    expect(screen.getByRole("button", { name: "Keep entry A" })).toBeTruthy();
  });

  it("renders the resolved summary for a historical decision not in the pending set", () => {
    render(
      <CopilotToolCallActionsProvider
        pendingInterruptToolCallIds={new Set()}
        respond={vi.fn()}
      >
        <DecisionArtifactToolCallCard
          output={artifactOutput}
          state="completed"
          toolCallId={TOOL_CALL_ID}
          toolName="requestDecision"
        />
      </CopilotToolCallActionsProvider>
    );

    expect(screen.queryByRole("button", { name: "Keep entry A" })).toBeNull();
    expect(screen.getByText("Decision submitted")).toBeTruthy();
  });

  it("calls respond with the toolCallId and chosen option", async () => {
    const user = userEvent.setup();
    const respond = vi.fn();
    render(
      <CopilotToolCallActionsProvider
        pendingInterruptToolCallIds={new Set([TOOL_CALL_ID])}
        respond={respond}
      >
        <DecisionArtifactToolCallCard
          output={artifactOutput}
          state="completed"
          toolCallId={TOOL_CALL_ID}
          toolName="requestDecision"
        />
      </CopilotToolCallActionsProvider>
    );

    await user.click(screen.getByRole("button", { name: "Keep entry A" }));
    expect(respond).toHaveBeenCalledWith(TOOL_CALL_ID, {
      artifactId: "artifact-1",
      choiceId: "a",
      choiceLabel: "Keep entry A",
      interruptId: "artifact-1",
    });
  });
});
