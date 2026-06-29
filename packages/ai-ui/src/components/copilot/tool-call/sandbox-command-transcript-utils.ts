import type { AgUiOpenInterruptMetadata } from "@engenty/ag-ui-bridge";
import { isSandboxCommandOpenInterrupt } from "@engenty/ag-ui-bridge";
import { getToolName, isToolPart } from "../transcript/copilot-message-parts";
import { isSandboxExecuteCommandToolName } from "./sandbox-command-tool-name";

export function transcriptHasActiveSandboxCommandToolPart(
  parts: readonly unknown[] | undefined,
  openInterrupt: AgUiOpenInterruptMetadata | null | undefined
): boolean {
  if (!(openInterrupt && isSandboxCommandOpenInterrupt(openInterrupt))) {
    return false;
  }
  const callId = openInterrupt.tool_call_id;
  for (const part of parts ?? []) {
    if (!isToolPart(part)) {
      continue;
    }
    if (part.toolCallId !== callId) {
      continue;
    }
    if (!isSandboxExecuteCommandToolName(getToolName(part))) {
      continue;
    }
    if (
      part.state === "approval-requested" ||
      part.state === "input-available" ||
      part.state === "input-streaming"
    ) {
      return true;
    }
  }
  return false;
}

export function shouldShowTopOpenInterruptBanner(
  open: AgUiOpenInterruptMetadata
): boolean {
  return open.kind !== "frontend_tool" && open.kind !== "sandbox_command";
}
