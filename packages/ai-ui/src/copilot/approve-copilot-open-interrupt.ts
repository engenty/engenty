import {
  AG_UI_FRONTEND_TOOL_EXECUTION_TIMEOUT_MS,
  type AgUiOpenInterruptMetadata,
  type FrontendToolCallRequest,
  type JsonValue,
} from "@engenty/ag-ui-bridge";

/**
 * Upper bound on how long the browser waits for a frontend-tool handler before
 * declaring it unresolved. A handler that never settles (or a tool whose
 * executor is missing on this lane) would otherwise leave the run suspended
 * indefinitely — this converts that into a "couldn't resolve" tool failure.
 */
class FrontendToolTimeoutError extends Error {
  constructor(toolName: string) {
    super(
      `Frontend tool "${toolName}" did not resolve in time (couldn't run).`
    );
    this.name = "FrontendToolTimeoutError";
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  toolName: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new FrontendToolTimeoutError(toolName)),
      ms
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

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
    const output = await withTimeout(
      Promise.resolve(
        executeFrontendTool({
          call_id: open.tool_call_id,
          input: open.tool_input ?? {},
          run_id: activeThreadId ?? "",
          tool_name: open.tool_name,
        })
      ),
      AG_UI_FRONTEND_TOOL_EXECUTION_TIMEOUT_MS,
      open.tool_name
    );
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
