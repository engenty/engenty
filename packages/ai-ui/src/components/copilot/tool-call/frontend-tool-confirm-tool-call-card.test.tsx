/** @vitest-environment happy-dom */
import { buildFrontendToolOpenInterrupt } from "@engenty/ag-ui-bridge";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopilotToolCallActionsProvider } from "../interrupts/copilot-tool-call-actions.js";
import { FrontendToolConfirmToolCallCard } from "./frontend-tool-confirm-tool-call-card.js";
import { isAwaitingFrontendToolConfirmationOutput } from "./frontend-tool-confirmation-output.js";

afterEach(() => {
  cleanup();
});

describe("isAwaitingFrontendToolConfirmationOutput", () => {
  it("detects awaiting_confirmation tool output", () => {
    expect(
      isAwaitingFrontendToolConfirmationOutput({
        call_id: "c1",
        status: "awaiting_confirmation",
        tool_name: "contacts_apply_draft_patch",
      })
    ).toBe(true);
  });
});

describe("FrontendToolConfirmToolCallCard", () => {
  const output = {
    call_id: "c1",
    input: { patch: [] },
    status: "awaiting_confirmation" as const,
    tool_name: "contacts_apply_draft_patch",
  };

  const open = buildFrontendToolOpenInterrupt({
    artifact_id: "c1",
    interrupt_id: "c1",
    title: "Apply Contact Draft Patch",
    tool_call_id: "c1",
    tool_name: "contacts_apply_draft_patch",
    tool_input: { patch: [] },
  });

  it("renders approve/reject when the open frontend-tool interrupt matches", () => {
    render(
      <CopilotToolCallActionsProvider
        awaitingInterrupt
        onFrontendToolApprove={vi.fn()}
        onFrontendToolReject={vi.fn()}
        openInterrupt={open}
      >
        <FrontendToolConfirmToolCallCard
          output={output}
          state="output-available"
          toolCallId="c1"
          toolName="invoke_frontend_tool"
        />
      </CopilotToolCallActionsProvider>
    );

    expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reject" })).toBeTruthy();
  });
});
