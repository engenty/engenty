"use client";

import {
  type AgUiOpenInterruptMetadata,
  buildSandboxCommandOpenInterrupt,
  isSandboxCommandOpenInterrupt,
} from "@engenty/ag-ui-bridge";
import { useCopilotToolCallActions } from "../interrupts/copilot-tool-call-actions";
import { SandboxCommandConfirmCard } from "../interrupts/sandbox-command-confirm-card";
import {
  isSandboxExecuteCommandToolName,
  SANDBOX_EXECUTE_COMMAND_TOOL_NAME,
} from "./sandbox-command-tool-name";
import type { ToolCallCardProps } from "./tool-call-card.types";
import { ToolCallCardBase } from "./tool-call-card-base";

function resolveOpenInterruptForToolCall(
  openInterrupt: AgUiOpenInterruptMetadata | null | undefined,
  toolCallId: string | undefined,
  toolInput: unknown
): AgUiOpenInterruptMetadata {
  if (
    openInterrupt &&
    isSandboxCommandOpenInterrupt(openInterrupt) &&
    openInterrupt.tool_call_id === toolCallId
  ) {
    return openInterrupt;
  }
  const command =
    toolInput &&
    typeof toolInput === "object" &&
    !Array.isArray(toolInput) &&
    typeof (toolInput as { command?: unknown }).command === "string"
      ? (toolInput as { command: string }).command
      : SANDBOX_EXECUTE_COMMAND_TOOL_NAME;
  const callId = toolCallId ?? "";
  return buildSandboxCommandOpenInterrupt({
    artifact_id: callId,
    interrupt_id: callId,
    title: `Approve command: ${command}`,
    tool_call_id: callId,
    tool_input:
      toolInput === undefined
        ? undefined
        : (JSON.parse(JSON.stringify(toolInput)) as never),
    tool_name: SANDBOX_EXECUTE_COMMAND_TOOL_NAME,
  });
}

function isActiveSandboxCommandConfirmation(input: {
  awaitingInterrupt?: boolean;
  callId: string;
  openInterrupt?: AgUiOpenInterruptMetadata | null;
}): boolean {
  if (!(input.awaitingInterrupt && input.openInterrupt)) {
    return false;
  }
  if (!isSandboxCommandOpenInterrupt(input.openInterrupt)) {
    return false;
  }
  return input.openInterrupt.tool_call_id === input.callId;
}

export function matchesSandboxCommandToolCall(
  toolName: string,
  _state: ToolCallCardProps["state"]
): boolean {
  // Own every state for the sandbox execute_command tool: `pending`/`running`
  // shows the approval card, `completed`/`error` shows the resolved command
  // output (so it never falls back to the generic "Command handled" card).
  return isSandboxExecuteCommandToolName(toolName);
}

function readCommandResult(input: unknown): {
  command?: string;
  exitCode?: number;
  rejected?: boolean;
  stderr?: string;
  stdout?: string;
  timedOut?: boolean;
} {
  // The backend normalizes execute_command output to a structured object, but
  // Mastra's raw tool result is a plain stdout string — render either so a bare
  // string (e.g. an un-normalized/legacy transcript row) still shows its output.
  if (typeof input === "string") {
    return { stdout: input };
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  const record = input as Record<string, unknown>;
  return {
    command: typeof record.command === "string" ? record.command : undefined,
    exitCode: typeof record.exitCode === "number" ? record.exitCode : undefined,
    rejected: record.rejected === true,
    stderr: typeof record.stderr === "string" ? record.stderr : undefined,
    stdout: typeof record.stdout === "string" ? record.stdout : undefined,
    timedOut: record.timedOut === true,
  };
}

function SandboxCommandResultBody({ output }: { output: string }) {
  return (
    <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-muted/40 p-2 font-mono text-foreground/80 text-xs">
      {output}
    </pre>
  );
}

export function SandboxCommandConfirmToolCallCard(props: ToolCallCardProps) {
  const {
    awaitingInterrupt,
    onFrontendToolApprove,
    onFrontendToolReject,
    openInterrupt,
  } = useCopilotToolCallActions();

  const callId = props.toolCallId ?? "";
  const open = resolveOpenInterruptForToolCall(
    openInterrupt,
    props.toolCallId,
    props.input
  );

  const isPending = isActiveSandboxCommandConfirmation({
    awaitingInterrupt,
    callId,
    openInterrupt: open,
  });

  if (!isPending) {
    const result = readCommandResult(props.output);
    const command =
      result.command ?? readCommandResult(props.input).command ?? "";
    const state = props.state === "error" ? "error" : "completed";
    const sections: string[] = [];
    if (command) {
      sections.push(`$ ${command}`);
    }
    if (result.stdout?.trim()) {
      sections.push(result.stdout.trimEnd());
    }
    if (result.stderr?.trim()) {
      sections.push(`stderr:\n${result.stderr.trimEnd()}`);
    }
    if (result.timedOut) {
      sections.push("(command timed out)");
    }
    if (result.exitCode !== undefined && result.exitCode !== 0) {
      sections.push(`(exit code ${result.exitCode})`);
    }
    const hasOutput = Boolean(
      result.stdout?.trim() || result.stderr?.trim() || result.timedOut
    );
    const body = result.rejected
      ? "Command rejected"
      : sections.join("\n\n") || "Command completed with no output";

    return (
      <ToolCallCardBase
        {...props}
        // Open by default once we have real output so the user sees the
        // command result inline without having to expand the row.
        defaultOpen={hasOutput}
        details={[]}
        headline={props.displayLabel ?? props.toolName}
        state={state}
      >
        <SandboxCommandResultBody output={body} />
      </ToolCallCardBase>
    );
  }

  return (
    <SandboxCommandConfirmCard
      onApprove={() => onFrontendToolApprove?.(open)}
      onReject={() => onFrontendToolReject?.(open)}
      open={open}
    />
  );
}
