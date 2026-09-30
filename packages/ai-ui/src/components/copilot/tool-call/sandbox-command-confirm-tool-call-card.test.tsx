/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CopilotToolCallActionsProvider } from "../interrupts/copilot-tool-call-actions.js";
import { SandboxCommandConfirmToolCallCard } from "./sandbox-command-confirm-tool-call-card.js";
import { SANDBOX_EXECUTE_COMMAND_TOOL_NAME } from "./sandbox-command-tool-name.js";

afterEach(() => {
  cleanup();
});

describe("SandboxCommandConfirmToolCallCard", () => {
  it("approves the command the open interrupt names", () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const open = {
      artifact_id: "tc-1",
      interrupt_id: "tc-1",
      kind: "sandbox_command" as const,
      title: "Approve command: tree",
      tool_call_id: "tc-1",
      tool_input: { command: "tree" },
      tool_name: SANDBOX_EXECUTE_COMMAND_TOOL_NAME,
    };

    render(
      <CopilotToolCallActionsProvider
        awaitingInterrupt
        onSandboxCommandApprove={onApprove}
        onSandboxCommandReject={onReject}
        openInterrupt={open}
      >
        <SandboxCommandConfirmToolCallCard
          displayLabel="Execute command"
          state="pending"
          toolCallId="tc-1"
          toolName={SANDBOX_EXECUTE_COMMAND_TOOL_NAME}
        />
      </CopilotToolCallActionsProvider>
    );

    screen.getByRole("button", { name: "Run command" }).click();
    expect(onApprove).toHaveBeenCalledWith(open);
  });

  it("renders a plain-string command result as stdout", () => {
    // Un-normalized rows carry Mastra's raw stdout string; it must still show.
    render(
      <CopilotToolCallActionsProvider>
        <SandboxCommandConfirmToolCallCard
          displayLabel="Execute command"
          input={{ command: "pwd && ls -la /sandbox" }}
          output={"/sandbox\nnotes.md\n"}
          state="completed"
          toolCallId="tc-1"
          toolName={SANDBOX_EXECUTE_COMMAND_TOOL_NAME}
        />
      </CopilotToolCallActionsProvider>
    );

    expect(screen.getByText(/\$ pwd && ls -la \/sandbox/)).toBeTruthy();
    expect(screen.getByText(/notes\.md/)).toBeTruthy();
  });
});
