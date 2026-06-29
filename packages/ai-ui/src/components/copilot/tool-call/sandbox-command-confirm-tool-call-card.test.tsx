/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CopilotToolCallActionsProvider } from "../interrupts/copilot-tool-call-actions.js";
import {
  matchesSandboxCommandToolCall,
  SandboxCommandConfirmToolCallCard,
} from "./sandbox-command-confirm-tool-call-card.js";
import { SANDBOX_EXECUTE_COMMAND_TOOL_NAME } from "./sandbox-command-tool-name.js";
import {
  shouldShowTopOpenInterruptBanner,
  transcriptHasActiveSandboxCommandToolPart,
} from "./sandbox-command-transcript-utils.js";

afterEach(() => {
  cleanup();
});

describe("matchesSandboxCommandToolCall", () => {
  it("matches pending execute_command tool rows", () => {
    expect(
      matchesSandboxCommandToolCall(
        SANDBOX_EXECUTE_COMMAND_TOOL_NAME,
        "pending"
      )
    ).toBe(true);
  });

  it("ignores unrelated tools", () => {
    expect(matchesSandboxCommandToolCall("web_search", "pending")).toBe(false);
  });
});

describe("shouldShowTopOpenInterruptBanner", () => {
  it("hides sandbox and frontend tool interrupts from the top banner", () => {
    expect(
      shouldShowTopOpenInterruptBanner({
        artifact_id: "a",
        interrupt_id: "a",
        kind: "sandbox_command",
        title: "Approve",
        tool_call_id: "tc",
        tool_name: SANDBOX_EXECUTE_COMMAND_TOOL_NAME,
      })
    ).toBe(false);
    expect(
      shouldShowTopOpenInterruptBanner({
        artifact_id: "a",
        interrupt_id: "a",
        kind: "frontend_tool",
        title: "Approve",
        tool_call_id: "tc",
        tool_name: "shell_set_theme",
      })
    ).toBe(false);
  });

  it("keeps decision interrupts in the top banner", () => {
    expect(
      shouldShowTopOpenInterruptBanner({
        artifact_id: "a",
        choices: [{ id: "yes", label: "Yes" }],
        interrupt_id: "a",
        kind: "decision",
        title: "Choose",
        tool_call_id: "tc",
      })
    ).toBe(true);
  });
});

describe("transcriptHasActiveSandboxCommandToolPart", () => {
  const open = {
    artifact_id: "tc-1",
    interrupt_id: "tc-1",
    kind: "sandbox_command" as const,
    title: "Approve command: tree",
    tool_call_id: "tc-1",
    tool_name: SANDBOX_EXECUTE_COMMAND_TOOL_NAME,
  };

  it("detects matching approval-requested tool parts", () => {
    expect(
      transcriptHasActiveSandboxCommandToolPart(
        [
          {
            state: "approval-requested",
            toolCallId: "tc-1",
            toolName: SANDBOX_EXECUTE_COMMAND_TOOL_NAME,
            type: "dynamic-tool",
          },
        ],
        open
      )
    ).toBe(true);
  });
});

describe("SandboxCommandConfirmToolCallCard", () => {
  it("renders inline approval actions for active sandbox interrupts", () => {
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
        onFrontendToolApprove={onApprove}
        onFrontendToolReject={onReject}
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

  it("renders the executed command output when resolved", () => {
    render(
      <CopilotToolCallActionsProvider>
        <SandboxCommandConfirmToolCallCard
          displayLabel="Execute command"
          output={{
            command: "tree -L 1 /sandbox",
            exitCode: 0,
            stderr: "",
            stdout: "/sandbox\n  notes.md",
          }}
          state="completed"
          toolCallId="tc-1"
          toolName={SANDBOX_EXECUTE_COMMAND_TOOL_NAME}
        />
      </CopilotToolCallActionsProvider>
    );

    expect(screen.getByText(/\$ tree -L 1 \/sandbox/)).toBeTruthy();
    expect(screen.getByText(/notes\.md/)).toBeTruthy();
  });

  it("renders a plain-string command result as stdout", () => {
    // Mastra's raw execute_command result is a plain stdout string; the card must
    // still surface it so the output never goes missing in the transcript.
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
