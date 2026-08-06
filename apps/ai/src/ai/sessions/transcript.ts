import type { AgUiOpenInterruptMetadata } from "@engenty/ag-ui-bridge";
import type { AgUiResumeEntry } from "./interrupts.js";

// Mastra workspace sandbox execute tool id (`WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND`).
// Mirrors the ai-ui constant of the same name so transcript persistence stays a
// pure util without pulling in the whole `@mastra/core/workspace` module.
const SANDBOX_EXECUTE_COMMAND_TOOL_NAME = "mastra_workspace_execute_command";

// Structured shape persisted on the execute_command tool-result part so the chat
// renderer can show the command output inline (it reads `stdout`/`stderr`/etc).
export interface SandboxCommandToolOutput {
  command?: string;
  exitCode?: number;
  stderr?: string;
  stdout?: string;
  timedOut?: boolean;
}

// Mastra's `execute_command` tool returns its result as a PLAIN STRING (the
// truncated stdout; on failure the string also carries stderr + "Exit code: N").
// The model receives that string fine, but the transcript renderer expects a
// structured `{ command, stdout, ... }` object — so without this normalization the
// command output is dropped from the chat while still reaching the model. Some
// providers may hand back a structured object instead; handle both. `command`
// comes from the call args (Mastra omits it from the result).
export function normalizeSandboxCommandToolOutput(
  args: unknown,
  result: unknown
): SandboxCommandToolOutput {
  const argsRecord =
    args && typeof args === "object" && !Array.isArray(args)
      ? (args as Record<string, unknown>)
      : null;
  const command =
    typeof argsRecord?.command === "string" ? argsRecord.command : undefined;
  const base: SandboxCommandToolOutput = command ? { command } : {};
  if (typeof result === "string") {
    return { ...base, stdout: result };
  }
  if (result && typeof result === "object" && !Array.isArray(result)) {
    const record = result as Record<string, unknown>;
    return {
      ...base,
      ...(typeof record.stdout === "string" ? { stdout: record.stdout } : {}),
      ...(typeof record.stderr === "string" ? { stderr: record.stderr } : {}),
      ...(typeof record.exitCode === "number"
        ? { exitCode: record.exitCode }
        : {}),
      ...(record.timedOut === true ? { timedOut: true } : {}),
    };
  }
  return base;
}

export interface AssistantDynamicToolPart {
  input?: unknown;
  // `output` is absent while a tool call is pending human approval
  // (`approval-requested`) or still running (`input-*`); filled once resolved.
  output?: unknown;
  /** Inline sub-agent stream log lines while sync delegation is running. */
  progressLines?: string[];
  state:
    | "approval-requested"
    | "input-available"
    | "input-streaming"
    | "output-available"
    | "output-error";
  toolCallId?: string;
  toolName: string;
  type: "dynamic-tool";
}

export function buildRunningToolPart(params: {
  input?: unknown;
  state?: "input-available" | "input-streaming";
  toolCallId: string;
  toolName: string;
}): AssistantDynamicToolPart {
  return {
    input: params.input,
    state: params.state ?? "input-available",
    toolCallId: params.toolCallId,
    toolName: params.toolName,
    type: "dynamic-tool",
  };
}

function readToolStreamField(
  payload: Record<string, unknown>,
  key: string
): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Map Mastra `tool-call` / `tool-execution-start` chunks to pending transcript parts. */
export function mastraToolStreamChunkToRunningToolPart(
  chunkType: "tool-call" | "tool-execution-start",
  payload: unknown
): AssistantDynamicToolPart | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const toolCallId = readToolStreamField(record, "toolCallId");
  const toolName = readToolStreamField(record, "toolName");
  if (!(toolCallId && toolName)) {
    return null;
  }
  const input = record.args ?? record.input;
  return buildRunningToolPart({
    input,
    state: chunkType === "tool-call" ? "input-streaming" : "input-available",
    toolCallId,
    toolName,
  });
}

export function isSubAgentDelegationToolName(toolName: string): boolean {
  return toolName.startsWith("agent-");
}

function readStreamRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  return payload as Record<string, unknown>;
}

function readExecuteCommandFromArgs(args: unknown): string | null {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return null;
  }
  const command = (args as Record<string, unknown>).command;
  return typeof command === "string" && command.trim() ? command.trim() : null;
}

function isSandboxExecuteCommandToolName(toolName: string): boolean {
  return (
    toolName === SANDBOX_EXECUTE_COMMAND_TOOL_NAME ||
    toolName.includes("execute_command")
  );
}

export function extractSubAgentStreamText(payload: unknown): string | null {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = readStreamRecord(payload);
  if (!record) {
    return null;
  }
  const nestedPayload = readStreamRecord(record.payload);
  if (nestedPayload) {
    const nestedText = extractSubAgentStreamText(nestedPayload);
    if (nestedText) {
      return nestedText;
    }
  }
  for (const key of [
    "text",
    "output",
    "message",
    "delta",
    "content",
  ] as const) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  const result = record.result;
  if (typeof result === "string" && result.trim()) {
    return result.trim();
  }
  return null;
}

/** Map Mastra stream chunks from a running `agent-*` delegation into log lines. */
export function formatSubAgentProgressLine(
  chunkType: string,
  payload: unknown
): string | null {
  if (chunkType.startsWith("agent-execution-event-")) {
    const innerType = chunkType.slice("agent-execution-event-".length);
    if (innerType === "output" || innerType === "progress") {
      return extractSubAgentStreamText(payload);
    }
    const record = readStreamRecord(payload);
    if (!record) {
      return null;
    }
    const innerPayload = record.payload ?? payload;
    const innerChunkType =
      typeof record.type === "string" && record.type.trim()
        ? record.type.trim()
        : innerType;
    return formatSubAgentProgressLine(innerChunkType, innerPayload);
  }

  if (chunkType === "tool-output") {
    const record = readStreamRecord(payload);
    const nested = record?.output ?? payload;
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const nestedRecord = nested as Record<string, unknown>;
      if (typeof nestedRecord.type === "string") {
        return formatSubAgentProgressLine(
          nestedRecord.type,
          nestedRecord.payload ?? nested
        );
      }
    }
    return extractSubAgentStreamText(payload);
  }

  const record = readStreamRecord(payload);
  if (!record) {
    return extractSubAgentStreamText(payload);
  }

  if (chunkType === "text-delta" || chunkType === "reasoning-delta") {
    const text = record.text;
    return typeof text === "string" && text.trim() ? text.trim() : null;
  }

  if (chunkType === "tool-call" || chunkType === "tool-execution-start") {
    const toolName = readToolStreamField(record, "toolName") ?? "tool";
    if (isSubAgentDelegationToolName(toolName)) {
      return null;
    }
    if (isSandboxExecuteCommandToolName(toolName)) {
      const command = readExecuteCommandFromArgs(record.args ?? record.input);
      return command ? `$ ${command}` : `$ ${toolName}`;
    }
    return `$ ${toolName}`;
  }

  if (chunkType === "tool-result") {
    const toolName = readToolStreamField(record, "toolName") ?? "tool";
    if (isSubAgentDelegationToolName(toolName)) {
      return null;
    }
    if (isSandboxExecuteCommandToolName(toolName)) {
      const normalized = normalizeSandboxCommandToolOutput(
        record.args ?? record.input,
        record.result
      );
      const chunks: string[] = [];
      if (normalized.command) {
        chunks.push(`$ ${normalized.command}`);
      }
      if (normalized.stdout?.trim()) {
        chunks.push(normalized.stdout.trim());
      }
      if (normalized.stderr?.trim()) {
        chunks.push(normalized.stderr.trim());
      }
      if (chunks.length > 0) {
        return chunks.join("\n");
      }
    }
    if (typeof record.result === "string" && record.result.trim()) {
      return record.result.trim();
    }
    if (record.result !== undefined && record.result !== null) {
      try {
        return JSON.stringify(record.result);
      } catch {
        return String(record.result);
      }
    }
    return null;
  }

  return extractSubAgentStreamText(payload);
}

export function findRunningSubAgentDelegationToolCallId(
  parts: readonly unknown[]
): string | null {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const item = parts[index];
    if (!isAssistantDynamicToolPart(item)) {
      continue;
    }
    if (!isSubAgentDelegationToolName(item.toolName)) {
      continue;
    }
    if (item.state !== "input-available" && item.state !== "input-streaming") {
      continue;
    }
    return item.toolCallId?.trim() ?? null;
  }
  return null;
}

export function readSubAgentStreamToolCallId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  return readToolStreamField(record, "toolCallId");
}

// Shared payload parser for harness transcript append and CUSTOM SSE emit.
export function parseSubAgentProgressStreamPayload(payload: unknown): {
  line: string;
  toolCallId: string;
  toolName: string | null;
} | null {
  const toolCallId = readSubAgentStreamToolCallId(payload);
  const line = extractSubAgentStreamText(payload);
  if (!(toolCallId && line)) {
    return null;
  }
  const toolName =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? readToolStreamField(payload as Record<string, unknown>, "toolName")
      : null;
  return { line, toolCallId, toolName };
}

export function appendSubAgentProgressLineToTranscriptParts(
  parts: unknown[],
  input: { line: string; toolCallId: string }
): unknown[] {
  const toolCallId = input.toolCallId.trim();
  const text = input.line.trim();
  if (!(toolCallId && text)) {
    return parts;
  }
  return parts.map((item) => {
    if (
      !isAssistantDynamicToolPart(item) ||
      item.toolCallId !== toolCallId ||
      (item.state !== "input-available" && item.state !== "input-streaming")
    ) {
      return item;
    }
    const progressLines = [...(item.progressLines ?? []), text];
    return { ...item, progressLines };
  });
}

export function appendSubAgentProgressFromStreamChunk(
  parts: unknown[],
  input: {
    chunkType: string;
    delegationToolCallId: string | null;
    payload: unknown;
  }
): { line: string | null; parts: unknown[]; toolCallId: string | null } {
  const delegationToolCallId =
    input.delegationToolCallId?.trim() ??
    findRunningSubAgentDelegationToolCallId(parts);
  if (!delegationToolCallId) {
    return { line: null, parts, toolCallId: null };
  }
  const line = formatSubAgentProgressLine(input.chunkType, input.payload);
  if (!line) {
    return { line: null, parts, toolCallId: null };
  }
  return {
    line,
    parts: appendSubAgentProgressLineToTranscriptParts(parts, {
      line,
      toolCallId: delegationToolCallId,
    }),
    toolCallId: delegationToolCallId,
  };
}

/** Append sync sub-agent stream output to the matching running tool part. */
export function appendSubAgentProgressToTranscriptParts(
  parts: unknown[],
  payload: unknown
): unknown[] {
  const toolCallId = readSubAgentStreamToolCallId(payload);
  const text = extractSubAgentStreamText(payload);
  if (!(toolCallId && text)) {
    return parts;
  }
  return appendSubAgentProgressLineToTranscriptParts(parts, {
    line: text,
    toolCallId,
  });
}

/** Mark a sync sub-agent tool part completed or failed from stream terminal events. */
export function finalizeSubAgentToolPartFromStreamEvent(
  parts: unknown[],
  eventType:
    | "agent-execution-event-completed"
    | "agent-execution-event-failed"
    | "agent-execution-event-cancelled",
  payload: unknown
): unknown[] {
  const toolCallId = readSubAgentStreamToolCallId(payload);
  if (!toolCallId) {
    return parts;
  }
  const state =
    eventType === "agent-execution-event-failed"
      ? "output-error"
      : "output-available";
  const output =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? ((payload as Record<string, unknown>).result ??
        (payload as Record<string, unknown>).output ??
        extractSubAgentStreamText(payload))
      : extractSubAgentStreamText(payload);
  return parts.map((item) => {
    if (
      !isAssistantDynamicToolPart(item) ||
      item.toolCallId !== toolCallId ||
      item.state === "output-available" ||
      item.state === "output-error"
    ) {
      return item;
    }
    return {
      ...item,
      ...(output !== undefined && output !== null ? { output } : {}),
      state,
    };
  });
}

// Pending HITL tool part (e.g. sandbox `execute_command` awaiting approval).
// Persisting this lets the inline approval card render in the transcript; the
// later `tool-result` replaces it by `toolCallId` once approved/rejected.
export function buildApprovalRequestedToolPart(params: {
  input?: unknown;
  toolCallId: string;
  toolName: string;
}): AssistantDynamicToolPart {
  return {
    type: "dynamic-tool",
    toolName: params.toolName,
    toolCallId: params.toolCallId,
    state: "approval-requested",
    input: params.input,
  };
}

export function isDecisionArtifactPayload(value: unknown): value is {
  artifact_id: string;
  artifact_type: "decision";
  body?: string;
  choices: { id: string; label: string }[];
  interrupt_id?: string;
  title: string;
} {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (value as { artifact_id?: unknown }).artifact_id == null ||
    typeof (value as { artifact_id?: unknown }).artifact_id !== "string" ||
    (value as { artifact_type?: unknown }).artifact_type !== "decision"
  ) {
    return false;
  }
  const title = (value as { title?: unknown }).title;
  if (typeof title !== "string") {
    return false;
  }
  const choices = (value as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) {
    return false;
  }
  for (const c of choices) {
    if (
      !c ||
      typeof c !== "object" ||
      typeof (c as { id?: unknown }).id !== "string" ||
      typeof (c as { label?: unknown }).label !== "string"
    ) {
      return false;
    }
  }
  return true;
}

export function isAwaitingFrontendToolConfirmation(value: unknown): value is {
  call_id: string;
  input?: unknown;
  status: "awaiting_confirmation";
  tool_name: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.status === "awaiting_confirmation" &&
    typeof record.call_id === "string" &&
    typeof record.tool_name === "string"
  );
}

/** UI transcript shape aligned with copilot `dynamic-tool` + DecisionArtifactCard `output`. */
function decisionArtifactToAssistantDynamicToolPart(payload: {
  artifact_id: string;
  artifact_type: "decision";
  body?: string;
  choices: { id: string; label: string }[];
  interrupt_id?: string;
  title: string;
}): AssistantDynamicToolPart {
  const out: Record<string, unknown> = {
    artifact_id: payload.artifact_id,
    artifact_type: payload.artifact_type,
    choices: payload.choices,
    title: payload.title,
  };
  if (payload.body !== undefined) {
    out.body = payload.body;
  }
  if (payload.interrupt_id !== undefined) {
    out.interrupt_id = payload.interrupt_id;
  }
  return {
    type: "dynamic-tool",
    toolName: "requestDecision",
    state: "output-available",
    output: out,
  };
}

export function toolResultPayloadToAssistantDynamicToolPart(payload: {
  args?: unknown;
  isError?: boolean;
  result: unknown;
  toolCallId: string;
  toolName: string;
}): AssistantDynamicToolPart {
  if (isDecisionArtifactPayload(payload.result)) {
    return {
      ...decisionArtifactToAssistantDynamicToolPart(payload.result),
      toolCallId: payload.toolCallId,
    };
  }
  if (payload.toolName === "invoke_frontend_tool") {
    const result =
      payload.result &&
      typeof payload.result === "object" &&
      !Array.isArray(payload.result)
        ? (payload.result as Record<string, unknown>)
        : null;
    const args =
      payload.args &&
      typeof payload.args === "object" &&
      !Array.isArray(payload.args)
        ? (payload.args as Record<string, unknown>)
        : null;
    const toolName =
      typeof result?.tool_name === "string" && result.tool_name.trim()
        ? result.tool_name
        : typeof args?.tool_name === "string" && args.tool_name.trim()
          ? args.tool_name
          : payload.toolName;
    const toolCallId =
      typeof result?.call_id === "string" && result.call_id.trim()
        ? result.call_id
        : payload.toolCallId;
    if (isAwaitingFrontendToolConfirmation(result)) {
      return {
        type: "dynamic-tool",
        toolName,
        toolCallId,
        state: "output-available",
        input: result.input ?? args?.input,
        output: result,
      };
    }
    const error = typeof result?.error === "string" ? result.error : null;
    const rejected = result?.rejected === true;
    return {
      type: "dynamic-tool",
      toolName,
      toolCallId,
      state:
        payload.isError || rejected || error
          ? "output-error"
          : "output-available",
      input: result?.input ?? args?.input,
      output:
        error ??
        (rejected
          ? "User rejected the frontend tool."
          : (result?.output ?? { ok: true })),
    };
  }
  if (payload.toolName === SANDBOX_EXECUTE_COMMAND_TOOL_NAME) {
    // Persist the command output as a structured object (not the raw stdout
    // string) so the renderer shows stdout/stderr inline on BOTH the non-approval
    // path and the HITL approval-resume path (which replaces the persisted
    // `approval-requested` part with this one by toolCallId).
    return {
      type: "dynamic-tool",
      toolName: payload.toolName,
      toolCallId: payload.toolCallId,
      state: payload.isError ? "output-error" : "output-available",
      input: payload.args,
      output: normalizeSandboxCommandToolOutput(payload.args, payload.result),
    };
  }
  return {
    type: "dynamic-tool",
    toolName: payload.toolName,
    toolCallId: payload.toolCallId,
    state: payload.isError ? "output-error" : "output-available",
    input: payload.args,
    output: payload.result,
  };
}

export function appendTextDeltaToTranscriptParts(
  parts: unknown[],
  delta: string
) {
  const last = parts.at(-1);
  if (
    last &&
    typeof last === "object" &&
    "type" in last &&
    (last as { type?: unknown }).type === "text"
  ) {
    const currentText = (last as { text?: unknown }).text;
    return [
      ...parts.slice(0, -1),
      {
        ...last,
        text: `${typeof currentText === "string" ? currentText : ""}${delta}`,
      },
    ];
  }
  return [...parts, { type: "text", text: delta }];
}

export function appendOrReplaceTranscriptToolPart(
  parts: unknown[],
  part: AssistantDynamicToolPart
) {
  const index = parts.findIndex(
    (item) => isAssistantDynamicToolPart(item) && isSameToolPart(item, part)
  );
  if (index < 0) {
    return [...parts, part];
  }
  const existing = parts[index] as AssistantDynamicToolPart;
  // tool-result rows omit progressLines; keep inline sub-agent log on completion.
  const progressLines =
    existing.progressLines?.length && !part.progressLines?.length
      ? existing.progressLines
      : part.progressLines;
  const merged: AssistantDynamicToolPart = {
    ...part,
    ...(progressLines?.length ? { progressLines } : {}),
  };
  return parts.map((item, i) => (i === index ? merged : item));
}

function isAssistantDynamicToolPart(
  value: unknown
): value is AssistantDynamicToolPart {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { type?: unknown }).type === "dynamic-tool" &&
    typeof (value as { toolName?: unknown }).toolName === "string"
  );
}

// Latest assistant message whose parts include a tool part for `toolCallId`.
// Used to continue a suspended HITL turn on resume so the resumed tool-result
// replaces the persisted `approval-requested` part in place (no duplicate card).
export function findAssistantMessageWithToolCall<
  T extends { id: string; parts: readonly unknown[]; role: string },
>(messages: readonly T[], toolCallId: string): T | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "assistant" || !Array.isArray(message.parts)) {
      continue;
    }
    const hasToolPart = message.parts.some(
      (part) =>
        isAssistantDynamicToolPart(part) && part.toolCallId === toolCallId
    );
    if (hasToolPart) {
      return message;
    }
  }
  return null;
}

export function readDecisionResumeChoice(resume: AgUiResumeEntry): {
  choiceId: string;
  choiceLabel: string;
} | null {
  if (resume.status === "cancelled") {
    return null;
  }
  const payload = resume.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const choiceId =
    typeof record.choice_id === "string" ? record.choice_id.trim() : "";
  const choiceLabel =
    typeof record.choice_label === "string" ? record.choice_label.trim() : "";
  if (!(choiceId && choiceLabel)) {
    return null;
  }
  return { choiceId, choiceLabel };
}

/**
 * What a decision resume actually said, once the server's own `choices[]` are
 * taken into account.
 *
 * `readDecisionResumeChoice` needs BOTH `choice_id` and `choice_label`, and its
 * approval callers read a null as "not approved" — so a payload naming a valid
 * `choice_id` with no label used to take the DENY path silently, looking exactly
 * like the user pressing Deny. That is the wrong direction to fail in, and it is
 * invisible: no error, no log. (The model-facing nudge in
 * `resumePayloadToModelContent` already falls back from label to id, so the two
 * halves of the same resume disagreed about what the user chose.)
 *
 * Resolution order:
 *  - cancelled           → an explicit deny; not an error.
 *  - id + label          → taken as-is (unchanged).
 *  - id only, id known   → label recovered from the interrupt's own choices.
 *  - id only, id unknown → `unresolved`; the caller must reject rather than
 *                          guess a direction.
 *  - no id at all        → `absent`; the payload is some other resume shape
 *                          (`{approved:false}`, `{rejected:true}`), so callers
 *                          keep their existing behaviour.
 */
export type DecisionResumeChoiceResolution =
  | { choiceId: string; choiceLabel: string; kind: "choice" }
  | { kind: "cancelled" }
  | { choiceId: string; kind: "unresolved" }
  | { kind: "absent" };

export function resolveDecisionResumeChoice(
  resume: AgUiResumeEntry,
  choices?: readonly { id: string; label: string }[]
): DecisionResumeChoiceResolution {
  if (resume.status === "cancelled") {
    return { kind: "cancelled" };
  }
  const direct = readDecisionResumeChoice(resume);
  if (direct) {
    return { ...direct, kind: "choice" };
  }
  const payload = resume.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { kind: "absent" };
  }
  const raw = (payload as Record<string, unknown>).choice_id;
  const choiceId = typeof raw === "string" ? raw.trim() : "";
  if (!choiceId) {
    return { kind: "absent" };
  }
  const known = choices?.find((choice) => choice.id === choiceId);
  if (known?.label) {
    return { choiceId, choiceLabel: known.label, kind: "choice" };
  }
  return { choiceId, kind: "unresolved" };
}

export function matchesRequestDecisionOpenInterrupt(
  part: AssistantDynamicToolPart,
  open: Pick<
    AgUiOpenInterruptMetadata,
    "artifact_id" | "interrupt_id" | "tool_call_id"
  >
): boolean {
  if (part.toolName !== "requestDecision") {
    return false;
  }
  if (part.toolCallId && part.toolCallId === open.tool_call_id) {
    return true;
  }
  if (!isDecisionArtifactPayload(part.output)) {
    return false;
  }
  return (
    part.output.artifact_id === open.artifact_id ||
    part.output.interrupt_id === open.interrupt_id ||
    part.output.interrupt_id === open.artifact_id
  );
}

export function mergeDecisionChoiceIntoArtifactOutput(
  output: unknown,
  choice: { choiceId: string; choiceLabel: string }
): unknown {
  if (!isDecisionArtifactPayload(output)) {
    return output;
  }
  return {
    ...output,
    choice_id: choice.choiceId,
    choice_label: choice.choiceLabel,
  };
}

export function patchDecisionResumeOntoMessageParts(
  parts: unknown,
  open: Pick<
    AgUiOpenInterruptMetadata,
    "artifact_id" | "interrupt_id" | "tool_call_id"
  >,
  choice: { choiceId: string; choiceLabel: string }
): { parts: unknown; patched: boolean } {
  if (!Array.isArray(parts)) {
    return { parts, patched: false };
  }
  let patched = false;
  const nextParts = parts.map((part) => {
    if (!isAssistantDynamicToolPart(part)) {
      return part;
    }
    if (!matchesRequestDecisionOpenInterrupt(part, open)) {
      return part;
    }
    patched = true;
    return {
      ...part,
      output: mergeDecisionChoiceIntoArtifactOutput(part.output, choice),
    };
  });
  return { parts: nextParts, patched };
}

export function isFeedbackArtifactPayload(value: unknown): value is {
  artifact_id: string;
  artifact_type: "feedback";
  body?: string;
  placeholder?: string;
  submit_label?: string;
  interrupt_id?: string;
  title: string;
} {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (value as { artifact_id?: unknown }).artifact_id == null ||
    typeof (value as { artifact_id?: unknown }).artifact_id !== "string" ||
    (value as { artifact_type?: unknown }).artifact_type !== "feedback"
  ) {
    return false;
  }
  const title = (value as { title?: unknown }).title;
  if (typeof title !== "string") {
    return false;
  }
  return true;
}

export function readFeedbackResumePayload(resume: AgUiResumeEntry): {
  feedback: string;
} | null {
  if (resume.status === "cancelled") {
    return null;
  }
  const payload = resume.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const feedback =
    typeof record.feedback === "string" ? record.feedback.trim() : "";
  if (!feedback) {
    return null;
  }
  return { feedback };
}

export function matchesRequestFeedbackOpenInterrupt(
  part: AssistantDynamicToolPart,
  open: Pick<
    AgUiOpenInterruptMetadata,
    "artifact_id" | "interrupt_id" | "tool_call_id"
  >
): boolean {
  if (part.toolName !== "requestFeedback") {
    return false;
  }
  if (part.toolCallId && part.toolCallId === open.tool_call_id) {
    return true;
  }
  if (!isFeedbackArtifactPayload(part.output)) {
    return false;
  }
  return (
    part.output.artifact_id === open.artifact_id ||
    part.output.interrupt_id === open.interrupt_id ||
    part.output.interrupt_id === open.artifact_id
  );
}

export function mergeFeedbackIntoArtifactOutput(
  output: unknown,
  payload: { feedback: string }
): unknown {
  if (!isFeedbackArtifactPayload(output)) {
    return output;
  }
  return {
    ...output,
    feedback: payload.feedback,
  };
}

export function patchFeedbackResumeOntoMessageParts(
  parts: unknown,
  open: Pick<
    AgUiOpenInterruptMetadata,
    "artifact_id" | "interrupt_id" | "tool_call_id"
  >,
  payload: { feedback: string }
): { parts: unknown; patched: boolean } {
  if (!Array.isArray(parts)) {
    return { parts, patched: false };
  }
  let patched = false;
  const nextParts = parts.map((part) => {
    if (!isAssistantDynamicToolPart(part)) {
      return part;
    }
    if (!matchesRequestFeedbackOpenInterrupt(part, open)) {
      return part;
    }
    patched = true;
    return {
      ...part,
      output: mergeFeedbackIntoArtifactOutput(part.output, payload),
    };
  });
  return { parts: nextParts, patched };
}

function isSameToolPart(
  current: {
    input?: unknown;
    toolCallId?: string;
    toolName: string;
  },
  next: {
    input?: unknown;
    toolCallId?: string;
    toolName: string;
  }
) {
  if (current.toolCallId || next.toolCallId) {
    return current.toolCallId === next.toolCallId;
  }
  return (
    current.toolName === next.toolName &&
    JSON.stringify(current.input ?? null) === JSON.stringify(next.input ?? null)
  );
}
