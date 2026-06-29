import type {
  AgUiOpenInterruptMetadata,
  FrontendToolCallRequest,
  JsonValue,
} from "@engenty/ag-ui-bridge";

export type CopilotOpenInterruptExecuteFrontendTool = (
  request: FrontendToolCallRequest
) => Promise<JsonValue> | JsonValue;

export type CopilotOpenInterruptResumeInterrupt = (feedback: {
  approved: boolean;
  /** Set when the browser handler threw — distinguishes a tool failure from a user rejection. */
  error?: string;
  interruptId: string;
  output?: JsonValue;
  toolName: string;
}) => void;

export interface ApproveCopilotOpenInterruptParams {
  activeThreadId: string | null;
  executeFrontendTool: CopilotOpenInterruptExecuteFrontendTool;
  onSuccess?: () => void;
  open: AgUiOpenInterruptMetadata;
  resumeInterrupt: CopilotOpenInterruptResumeInterrupt;
}

export interface RejectCopilotOpenInterruptParams {
  open: AgUiOpenInterruptMetadata;
  resumeInterrupt: CopilotOpenInterruptResumeInterrupt;
}

// Sandbox command interrupts resume on the server; browser frontend tools run locally first.
export async function approveCopilotOpenInterrupt(
  params: ApproveCopilotOpenInterruptParams
): Promise<void> {
  const {
    activeThreadId,
    executeFrontendTool,
    onSuccess,
    open,
    resumeInterrupt,
  } = params;

  if (!open.tool_name) {
    return;
  }

  if (open.kind === "sandbox_command") {
    resumeInterrupt({
      approved: true,
      interruptId: open.interrupt_id,
      toolName: open.tool_name,
    });
    onSuccess?.();
    return;
  }

  try {
    const output = await executeFrontendTool({
      call_id: open.tool_call_id,
      input: open.tool_input ?? {},
      requires_confirmation: true,
      run_id: activeThreadId ?? "",
      tool_name: open.tool_name,
    });
    resumeInterrupt({
      approved: true,
      interruptId: open.interrupt_id,
      output: output as JsonValue,
      toolName: open.tool_name,
    });
    onSuccess?.();
  } catch (error) {
    // The handler FAILED — surface the real error instead of swallowing it and
    // resuming as a bare `approved: false`, which the agent reports as the
    // misleading "User rejected the frontend tool".
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[frontend-tool] ${open.tool_name} handler failed:`, error);
    resumeInterrupt({
      approved: false,
      error: message,
      interruptId: open.interrupt_id,
      toolName: open.tool_name,
    });
  }
}

export function rejectCopilotOpenInterrupt(
  params: RejectCopilotOpenInterruptParams
): void {
  const { open, resumeInterrupt } = params;

  if (!open.tool_name) {
    return;
  }

  resumeInterrupt({
    approved: false,
    interruptId: open.interrupt_id,
    toolName: open.tool_name,
  });
}
