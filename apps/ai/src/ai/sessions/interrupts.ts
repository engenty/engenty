// HITL interrupt metadata + resume validation for AG-UI session runs.
// Sandbox commands: native Mastra suspend/resume via resumeStreamUntilIdle.
// Frontend tools + decision artifacts: AG-UI interrupt + transcript resume nudge
// (no server-side suspend — browser execution and decision tools lack Mastra
// suspend hooks until those tools call context.suspend with a resumeSchema).
import type { JsonValue, RunAgentInput } from "@engenty/ag-ui-bridge";
import {
  AG_UI_OPEN_INTERRUPT_METADATA_KEY,
  type AgUiOpenInterruptMetadata,
  agUiOpenInterruptTtlMsForKind,
  buildAgUiOpenInterruptExpiresAt,
  buildFrontendToolOpenInterrupt,
  buildSandboxCommandOpenInterrupt,
  isAgUiOpenInterruptExpired,
  isFrontendToolOpenInterrupt,
  isSandboxCommandOpenInterrupt,
} from "@engenty/ag-ui-bridge";
import { WORKSPACE_TOOLS } from "@mastra/core/workspace";
import { AiSessionError } from "../errors.js";

export type { AgUiOpenInterruptMetadata } from "@engenty/ag-ui-bridge";
export {
  AG_UI_OPEN_INTERRUPT_DEFAULT_TTL_MS,
  AG_UI_OPEN_INTERRUPT_METADATA_KEY,
  readAgUiOpenInterrupt,
} from "@engenty/ag-ui-bridge";

export type AgUiResumeEntry = NonNullable<RunAgentInput["resume"]>[number];

export interface DecisionInterruptPayload {
  artifact: {
    artifact_id: string;
    artifact_type: "decision";
    body?: string;
    choices: { id: string; label: string }[];
    interrupt_id?: string;
    title: string;
  };
  interruptId: string;
  kind: "decision";
  toolCallId: string;
}

export interface FeedbackInterruptPayload {
  artifact: {
    artifact_id: string;
    artifact_type: "feedback";
    body?: string;
    placeholder?: string;
    submit_label?: string;
    interrupt_id?: string;
    title: string;
  };
  interruptId: string;
  kind: "feedback";
  toolCallId: string;
}

export interface FrontendToolInterruptPayload {
  interruptId: string;
  kind: "frontend_tool";
  /** Suspended Mastra run id — persisted so resume reloads the snapshot natively. */
  runId: string;
  title: string;
  toolCallId: string;
  toolInput?: JsonValue;
  toolName: string;
}

export interface SandboxCommandInterruptPayload {
  interruptId: string;
  kind: "sandbox_command";
  // Suspended Mastra run id — persisted so resume reloads the snapshot natively.
  runId: string;
  title: string;
  toolCallId: string;
  toolInput?: JsonValue;
  toolName: string;
}

export type SessionInterruptPayload =
  | DecisionInterruptPayload
  | FeedbackInterruptPayload
  | FrontendToolInterruptPayload
  | SandboxCommandInterruptPayload;

export const SANDBOX_EXECUTE_COMMAND_TOOL_NAME =
  WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND;

export function isSandboxExecuteCommandToolName(toolName: string): boolean {
  return toolName === SANDBOX_EXECUTE_COMMAND_TOOL_NAME;
}

/**
 * The persisted form of an open interrupt — the value alone, with the TTL
 * defaulted. Prefer this plus a single-key metadata merge over rebuilding the
 * whole metadata object: a merge computed here is merged onto a row read
 * earlier, so any key written in between is reverted on write.
 */
export function buildAgUiOpenInterruptValue(
  open: AgUiOpenInterruptMetadata
): AgUiOpenInterruptMetadata {
  return {
    ...open,
    expires_at:
      open.expires_at ??
      buildAgUiOpenInterruptExpiresAt(
        Date.now(),
        agUiOpenInterruptTtlMsForKind(open.kind)
      ),
  };
}

export function mergeAgUiOpenInterruptMetadata(
  metadata: Record<string, unknown>,
  open: AgUiOpenInterruptMetadata | null
): Record<string, unknown> {
  const next = { ...metadata };
  if (open) {
    next[AG_UI_OPEN_INTERRUPT_METADATA_KEY] = buildAgUiOpenInterruptValue(open);
  } else {
    const { [AG_UI_OPEN_INTERRUPT_METADATA_KEY]: _removed, ...rest } = next;
    return rest;
  }
  return next;
}

export function buildDecisionInterruptOutcome(
  payload: DecisionInterruptPayload
): {
  interrupts: {
    id: string;
    message?: string;
    reason: string;
    toolCallId: string;
  }[];
  type: "interrupt";
} {
  const { artifact, interruptId, toolCallId } = payload;
  return {
    interrupts: [
      {
        id: interruptId,
        message: artifact.title,
        reason: "tool_call",
        toolCallId,
      },
    ],
    type: "interrupt",
  };
}

export function buildFrontendToolInterruptOutcome(
  payload: FrontendToolInterruptPayload
): {
  interrupts: {
    id: string;
    message?: string;
    reason: string;
    toolCallId: string;
  }[];
  type: "interrupt";
} {
  return {
    interrupts: [
      {
        id: payload.interruptId,
        message: payload.title,
        reason: "tool_call",
        toolCallId: payload.toolCallId,
      },
    ],
    type: "interrupt",
  };
}

export function buildFeedbackInterruptOutcome(
  payload: FeedbackInterruptPayload
): {
  interrupts: {
    id: string;
    message?: string;
    reason: string;
    toolCallId: string;
  }[];
  type: "interrupt";
} {
  const { artifact, interruptId, toolCallId } = payload;
  return {
    interrupts: [
      {
        id: interruptId,
        message: artifact.title,
        reason: "tool_call",
        toolCallId,
      },
    ],
    type: "interrupt",
  };
}

export function buildSessionInterruptOutcome(
  payload: SessionInterruptPayload
): ReturnType<typeof buildDecisionInterruptOutcome> {
  if (payload.kind === "frontend_tool") {
    return buildFrontendToolInterruptOutcome(payload);
  }
  if (payload.kind === "feedback") {
    return buildFeedbackInterruptOutcome(payload);
  }
  if (payload.kind === "sandbox_command") {
    return buildFrontendToolInterruptOutcome({
      interruptId: payload.interruptId,
      kind: "frontend_tool",
      runId: payload.runId,
      title: payload.title,
      toolCallId: payload.toolCallId,
      toolInput: payload.toolInput,
      toolName: payload.toolName,
    });
  }
  return buildDecisionInterruptOutcome(payload);
}

export function buildFrontendToolOpenInterruptFromPayload(
  payload: FrontendToolInterruptPayload
): AgUiOpenInterruptMetadata {
  return buildFrontendToolOpenInterrupt({
    artifact_id: payload.interruptId,
    interrupt_id: payload.interruptId,
    run_id: payload.runId,
    title: payload.title,
    tool_call_id: payload.toolCallId,
    tool_input: payload.toolInput,
    tool_name: payload.toolName,
  });
}

export function formatFrontendToolResumeToolResultContent(params: {
  open: AgUiOpenInterruptMetadata;
  resume: AgUiResumeEntry;
  runId: string;
}): string {
  const payload =
    params.resume.payload &&
    typeof params.resume.payload === "object" &&
    !Array.isArray(params.resume.payload)
      ? (params.resume.payload as Record<string, unknown>)
      : {};
  const rejected =
    params.resume.status === "cancelled" ||
    payload.rejected === true ||
    payload.approved === false;
  const toolName = params.open.tool_name ?? "frontend_tool";
  const result = rejected
    ? {
        call_id: params.open.tool_call_id,
        rejected: true,
        run_id: params.runId,
        tool_name: toolName,
      }
    : {
        call_id: params.open.tool_call_id,
        output: payload.output ?? { ok: true },
        run_id: params.runId,
        tool_name: toolName,
      };
  return JSON.stringify(result);
}

export function buildSandboxCommandOpenInterruptFromPayload(
  payload: SandboxCommandInterruptPayload
): AgUiOpenInterruptMetadata {
  return buildSandboxCommandOpenInterrupt({
    artifact_id: payload.interruptId,
    interrupt_id: payload.interruptId,
    run_id: payload.runId,
    title: payload.title,
    tool_call_id: payload.toolCallId,
    tool_input: payload.toolInput,
    tool_name: payload.toolName,
  });
}

export function isSandboxCommandResumePayload(
  open: AgUiOpenInterruptMetadata | null
): boolean {
  return open != null && isSandboxCommandOpenInterrupt(open);
}

export function isFrontendToolResumePayload(
  open: AgUiOpenInterruptMetadata | null
): boolean {
  return open != null && isFrontendToolOpenInterrupt(open);
}

export function resumePayloadToModelContent(entry: AgUiResumeEntry): string {
  if (entry.status === "cancelled") {
    return "The user cancelled the decision.";
  }
  const payload = entry.payload;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    const feedback = record.feedback;
    if (typeof feedback === "string" && feedback.trim()) {
      return `The user responded: ${feedback.trim()}`;
    }
    const choiceLabel = record.choice_label;
    if (typeof choiceLabel === "string" && choiceLabel.trim()) {
      return `The user selected: ${choiceLabel.trim()}`;
    }
    const choiceId = record.choice_id;
    if (typeof choiceId === "string" && choiceId.trim()) {
      return `The user selected: ${choiceId.trim()}`;
    }
    if (record.approved === true) {
      // Sandbox command resume carries the executed command's output here;
      // surface it so the model can report the real result (not just "approved").
      if (record.output !== undefined) {
        try {
          return `The user approved the command. Result: ${JSON.stringify(record.output)}`;
        } catch {
          return "The user approved the command.";
        }
      }
      return "The user approved.";
    }
    if (record.approved === false) {
      return "The user declined the browser action.";
    }
    if (record.rejected === true) {
      return "The user rejected the browser action.";
    }
    if (record.output !== undefined) {
      try {
        return `The user approved the browser action. Result: ${JSON.stringify(record.output)}`;
      } catch {
        return "The user approved the browser action.";
      }
    }
  }
  return "The user resolved the decision.";
}

export function assertResumeMatchesOpenInterrupt(params: {
  nowMs?: number;
  open: AgUiOpenInterruptMetadata | null;
  resume: AgUiResumeEntry[];
  threadId: string;
}): void {
  const entry = params.resume[0];
  if (!entry) {
    throw new AiSessionError(
      "agent_threads.invalidResume",
      "Resume run requires at least one resume entry",
      { thread_id: params.threadId }
    );
  }
  if (params.resume.length > 1) {
    throw new AiSessionError(
      "agent_threads.invalidResume",
      "Only one resume entry is supported per run",
      { thread_id: params.threadId }
    );
  }
  const open = params.open;
  if (!open) {
    throw new AiSessionError(
      "agent_threads.interruptNotFound",
      "No open interrupt for this session",
      { thread_id: params.threadId, interrupt_id: entry.interruptId }
    );
  }
  if (isAgUiOpenInterruptExpired(open, params.nowMs)) {
    throw new AiSessionError(
      "agent_threads.interruptExpired",
      "The open interrupt has expired",
      {
        expires_at: open.expires_at,
        interrupt_id: open.interrupt_id,
        thread_id: params.threadId,
      }
    );
  }
  if (open.interrupt_id !== entry.interruptId) {
    throw new AiSessionError(
      "agent_threads.interruptMismatch",
      "Resume interrupt id does not match the open interrupt",
      {
        expected_interrupt_id: open.interrupt_id,
        interrupt_id: entry.interruptId,
        thread_id: params.threadId,
      }
    );
  }
}

export function runInputHasNewUserMessages(input: RunAgentInput): boolean {
  // `RunAgentInput` is zod-inferred in @ag-ui/core (zod 3) and lands untyped
  // here (zod 4) — annotate what we read rather than leaning on implicit any.
  return input.messages.some(
    (message: { role?: string }) => message.role === "user"
  );
}
