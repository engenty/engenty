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

  // `requestDecision` suspends the run instead of returning its artifact
  // (apps/ai native-request-decision.ts), so these calls reach the card with NO
  // output at all — the choices exist only on the open interrupt.
  describe("a natively suspended decision (no tool output)", () => {
    const openInterrupt = {
      artifact_id: "artifact-1",
      body: artifactOutput.body,
      choices: artifactOutput.choices,
      interrupt_id: "artifact-1",
      kind: "decision" as const,
      title: artifactOutput.title,
      tool_call_id: TOOL_CALL_ID,
    };

    it("renders the chooser from the open interrupt", () => {
      render(
        <CopilotToolCallActionsProvider
          openInterrupt={openInterrupt}
          pendingInterruptToolCallIds={new Set([TOOL_CALL_ID])}
          respond={vi.fn()}
        >
          <DecisionArtifactToolCallCard
            state="running"
            toolCallId={TOOL_CALL_ID}
            toolName="requestDecision"
          />
        </CopilotToolCallActionsProvider>
      );

      expect(screen.getByRole("button", { name: "Keep entry A" })).toBeTruthy();
      expect(screen.getByText("Which entry should I keep?")).toBeTruthy();
    });

    it("still renders it after a reload, with no pending set from the stream", () => {
      // `pendingInterruptToolCallIds` comes from RUN_FINISHED; a reload replays
      // no stream, so it is empty. Reading that as "complete" reported a card
      // the user never answered as answered.
      render(
        <CopilotToolCallActionsProvider
          openInterrupt={openInterrupt}
          pendingInterruptToolCallIds={new Set()}
          respond={vi.fn()}
        >
          <DecisionArtifactToolCallCard
            state="running"
            toolCallId={TOOL_CALL_ID}
            toolName="requestDecision"
          />
        </CopilotToolCallActionsProvider>
      );

      expect(screen.getByRole("button", { name: "Keep entry A" })).toBeTruthy();
      expect(screen.queryByText("Decision submitted")).toBeNull();
    });

    it("does not borrow ANOTHER call's open interrupt", () => {
      // Routing is by tool name now, so every unanswered decision row in the
      // thread reaches this card. Without the id check they would all render
      // whichever chooser is currently open — the same question several times,
      // only one of which can be answered.
      render(
        <CopilotToolCallActionsProvider
          openInterrupt={{ ...openInterrupt, tool_call_id: "tc-other" }}
          pendingInterruptToolCallIds={new Set(["tc-other"])}
          respond={vi.fn()}
        >
          <DecisionArtifactToolCallCard
            state="running"
            toolCallId={TOOL_CALL_ID}
            toolName="requestDecision"
          />
        </CopilotToolCallActionsProvider>
      );

      expect(screen.queryByRole("button", { name: "Keep entry A" })).toBeNull();
      // Not just "no buttons": the other call's QUESTION must not appear here
      // at all. Borrowing it rendered this row as an already-answered copy of a
      // decision that belongs to a different tool call.
      expect(screen.queryByText("Which entry should I keep?")).toBeNull();
      expect(screen.getByText("Decision needed")).toBeTruthy();
    });

    it("falls back to the transcript row instead of erasing the call", () => {
      render(
        <CopilotToolCallActionsProvider
          pendingInterruptToolCallIds={new Set()}
          respond={vi.fn()}
        >
          <DecisionArtifactToolCallCard
            state="running"
            toolCallId={TOOL_CALL_ID}
            toolName="requestDecision"
          />
        </CopilotToolCallActionsProvider>
      );

      expect(screen.getByText("Decision needed")).toBeTruthy();
    });

    it("answers through respond with the interrupt's artifact ids", async () => {
      const user = userEvent.setup();
      const respond = vi.fn();
      render(
        <CopilotToolCallActionsProvider
          openInterrupt={openInterrupt}
          pendingInterruptToolCallIds={new Set([TOOL_CALL_ID])}
          respond={respond}
        >
          <DecisionArtifactToolCallCard
            state="running"
            toolCallId={TOOL_CALL_ID}
            toolName="requestDecision"
          />
        </CopilotToolCallActionsProvider>
      );

      await user.click(screen.getByRole("button", { name: "Keep entry B" }));
      expect(respond).toHaveBeenCalledWith(TOOL_CALL_ID, {
        artifactId: "artifact-1",
        choiceId: "b",
        choiceLabel: "Keep entry B",
        interruptId: "artifact-1",
      });
    });
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
