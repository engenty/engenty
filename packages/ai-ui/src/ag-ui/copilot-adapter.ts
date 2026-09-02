import {
  agUiMessageText,
  isToolApprovalResumeNudgeText,
  sortAgUiMessagesForTranscript,
} from "@engenty/ai-core/browser";
import type {
  DynamicToolUIPart,
  UIDataTypes,
  UIMessagePart,
  UITools,
} from "ai";
import type { CopilotPanelContentProps } from "../components/presentation.js";
import { attachDynamicToolDisplay } from "./normalize-dynamic-tool-part.js";
import { mergeDynamicToolPartsInOrder } from "./tool-call-merge.js";

type CopilotMessagePart = UIMessagePart<UIDataTypes, UITools>;

import type { EngentyAgUiMessage } from "./conversation.js";

type Message = EngentyAgUiMessage;

interface AgUiToolCall {
  function: {
    arguments: string;
    name: string;
  };
  id: string;
  type: "function";
}

function readAssistantToolCalls(
  message: Extract<Message, { role: "assistant" }>
): AgUiToolCall[] {
  return (message.toolCalls ?? []) as AgUiToolCall[];
}

type DynamicToolPartState =
  | "input-available"
  | "input-streaming"
  | "output-available"
  | "output-error";

interface IndexedToolResult {
  input?: unknown;
  output?: unknown;
  state: DynamicToolPartState;
  toolCallId: string;
  toolName: string;
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasToolInputFields(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).length > 0;
}

function resolveTranscriptToolInput(
  rawPart: Record<string, unknown>,
  toolResults: Map<string, IndexedToolResult>,
  toolCallArgs?: unknown
): unknown {
  const toolCallId =
    typeof rawPart.toolCallId === "string" && rawPart.toolCallId.trim()
      ? rawPart.toolCallId.trim()
      : null;
  const indexed = toolCallId ? toolResults.get(toolCallId) : undefined;
  const candidates = [rawPart.input, indexed?.input, toolCallArgs];
  for (const candidate of candidates) {
    if (hasToolInputFields(candidate)) {
      return candidate;
    }
  }
  return rawPart.input ?? indexed?.input ?? toolCallArgs ?? {};
}

function resolveDynamicToolState(
  state: unknown,
  hasOutput: boolean,
  hasError: boolean
): DynamicToolPartState {
  if (hasError) {
    return "output-error";
  }
  if (hasOutput) {
    return "output-available";
  }
  if (
    state === "output-available" ||
    state === "output-error" ||
    state === "input-available" ||
    state === "input-streaming"
  ) {
    return state;
  }
  if (state === "result" || state === "done" || state === "completed") {
    return "output-available";
  }
  return "input-available";
}

// Mastra MessageList rows may use `tool-invocation` with nested toolInvocation.*.
function flattenTranscriptToolPart(
  rawPart: Record<string, unknown>
): Record<string, unknown> {
  const toolInvocation = rawPart.toolInvocation;
  if (!isRecord(toolInvocation)) {
    return rawPart;
  }
  const toolCallId =
    (typeof rawPart.toolCallId === "string" && rawPart.toolCallId.trim()
      ? rawPart.toolCallId.trim()
      : null) ??
    (typeof toolInvocation.toolCallId === "string" &&
    toolInvocation.toolCallId.trim()
      ? toolInvocation.toolCallId.trim()
      : null);
  const toolName =
    (typeof rawPart.toolName === "string" && rawPart.toolName.trim()
      ? rawPart.toolName.trim()
      : null) ??
    (typeof toolInvocation.toolName === "string" &&
    toolInvocation.toolName.trim()
      ? toolInvocation.toolName.trim()
      : null);
  const input =
    rawPart.input ?? toolInvocation.args ?? toolInvocation.input ?? undefined;
  const output =
    rawPart.output ??
    toolInvocation.result ??
    toolInvocation.output ??
    undefined;
  const nestedState = toolInvocation.state;
  const state =
    rawPart.state ??
    (nestedState === "result" || nestedState === "done"
      ? "output-available"
      : nestedState);
  return {
    ...rawPart,
    ...(toolCallId ? { toolCallId } : {}),
    ...(toolName ? { toolName } : {}),
    ...(input === undefined ? {} : { input }),
    ...(output === undefined ? {} : { output }),
    ...(state === undefined ? {} : { state }),
    type: rawPart.type === "tool-invocation" ? "dynamic-tool" : rawPart.type,
  };
}

function indexToolResults(
  messages: readonly Message[]
): Map<string, IndexedToolResult> {
  const index = new Map<string, IndexedToolResult>();
  for (const message of messages) {
    if (message.role !== "tool") {
      continue;
    }
    const parsed = parseToolResultMessage(message);
    if (parsed) {
      index.set(parsed.toolCallId, parsed);
    }
  }
  return index;
}

function isWrappedToolResultPayload(parsed: Record<string, unknown>): boolean {
  return (
    parsed.type === "dynamic-tool" ||
    typeof parsed.toolName === "string" ||
    parsed.state !== undefined
  );
}

function parseToolResultMessage(
  message: Extract<Message, { role: "tool" }>
): IndexedToolResult | null {
  const toolCallId = message.toolCallId?.trim();
  if (!toolCallId) {
    return null;
  }
  const rawContent =
    typeof message.content === "string"
      ? message.content
      : JSON.stringify(message.content ?? null);
  const parsed = safeJson(rawContent);
  if (isRecord(parsed) && isWrappedToolResultPayload(parsed)) {
    const toolName =
      typeof parsed.toolName === "string" && parsed.toolName.trim()
        ? parsed.toolName
        : "tool";
    const hasOutput = parsed.output !== undefined;
    const hasError =
      (message as { error?: string | boolean }).error === true ||
      parsed.state === "output-error" ||
      typeof parsed.error === "string";
    return {
      toolCallId,
      toolName,
      input: parsed.input,
      output:
        parsed.output ??
        (typeof parsed.error === "string" ? parsed.error : undefined),
      state: resolveDynamicToolState(
        parsed.state,
        hasOutput || typeof parsed.error === "string",
        hasError
      ),
    };
  }
  return {
    toolCallId,
    toolName: "",
    output: parsed,
    state: message.error ? "output-error" : "output-available",
  };
}

function indexedResultFromTranscriptPart(
  part: Record<string, unknown>
): IndexedToolResult | undefined {
  const toolCallId =
    typeof part.toolCallId === "string" && part.toolCallId.trim()
      ? part.toolCallId.trim()
      : null;
  if (!toolCallId) {
    return;
  }
  const toolName =
    typeof part.toolName === "string" && part.toolName.trim()
      ? part.toolName
      : "tool";
  const hasOutput = part.output !== undefined;
  const hasError =
    part.state === "output-error" || typeof part.error === "string";
  if (!(hasOutput || hasError) && part.state !== "input-streaming") {
    return;
  }
  return {
    toolCallId,
    toolName,
    input: part.input,
    output:
      part.output ?? (typeof part.error === "string" ? part.error : undefined),
    state: resolveDynamicToolState(
      part.state,
      hasOutput || typeof part.error === "string",
      hasError
    ),
  };
}

// progressLines live on transcript_parts during streaming and in persisted snapshots.
function readProgressLines(
  rawPart: Record<string, unknown>
): string[] | undefined {
  const progressLines = rawPart.progressLines;
  if (!Array.isArray(progressLines)) {
    return;
  }
  const lines = progressLines.filter(
    (line): line is string => typeof line === "string" && line.trim().length > 0
  );
  return lines.length > 0 ? lines : undefined;
}

function withProgressLines<T extends Record<string, unknown>>(
  part: T,
  rawPart: Record<string, unknown>
): T & { progressLines?: string[] } {
  const progressLines = readProgressLines(rawPart);
  return progressLines ? { ...part, progressLines } : part;
}

function dynamicToolPartFromIndexedResult(
  toolCallId: string,
  wireToolName: string,
  args: unknown,
  result: IndexedToolResult | undefined,
  rawPart?: Record<string, unknown>
): CopilotMessagePart {
  const toolName = wireToolName.trim() || result?.toolName.trim() || "tool";
  const input = result?.input ?? args;

  let basePart: DynamicToolUIPart;

  if (result) {
    switch (result.state) {
      case "input-streaming":
        basePart = {
          type: "dynamic-tool",
          toolCallId,
          toolName,
          state: "input-streaming",
          input,
        };
        break;
      case "input-available":
        basePart = {
          type: "dynamic-tool",
          toolCallId,
          toolName,
          state: "input-available",
          input,
        };
        break;
      case "output-available":
        if (result.output === undefined) {
          basePart = {
            type: "dynamic-tool",
            toolCallId,
            toolName,
            state: "input-available",
            input,
          };
        } else {
          basePart = {
            type: "dynamic-tool",
            toolCallId,
            toolName,
            state: "output-available",
            input,
            output: result.output,
          };
        }
        break;
      case "output-error":
        basePart = {
          type: "dynamic-tool",
          toolCallId,
          toolName,
          state: "output-error",
          input,
          errorText:
            typeof result.output === "string"
              ? result.output
              : "Tool execution failed",
        };
        break;
    }
  } else {
    basePart = {
      type: "dynamic-tool",
      toolCallId,
      toolName,
      state: "input-available",
      input,
    };
  }

  const withDisplay = attachDynamicToolDisplay(
    basePart,
    toolName
  ) as CopilotMessagePart;
  return rawPart
    ? (withProgressLines(
        withDisplay as Record<string, unknown>,
        rawPart
      ) as CopilotMessagePart)
    : withDisplay;
}

function isUIMessagePart(value: unknown): value is CopilotMessagePart {
  return isRecord(value) && typeof value.type === "string";
}

function readTranscriptParts(message: Message): unknown[] | null {
  if (!isRecord(message.metadata)) {
    return null;
  }
  const transcriptParts = message.metadata.transcript_parts;
  return Array.isArray(transcriptParts) ? transcriptParts : null;
}

// Mastra MessageList may persist `tool-invocation` rows; read nested toolName
// instead of inferring the useless wire id `invocation` from the part type.
function resolveWireToolNameFromTranscriptPart(
  rawPart: Record<string, unknown>
): string | null {
  if (rawPart.type === "dynamic-tool") {
    const toolName =
      typeof rawPart.toolName === "string" ? rawPart.toolName.trim() : "";
    return toolName || null;
  }
  if (typeof rawPart.toolName === "string" && rawPart.toolName.trim()) {
    return rawPart.toolName.trim();
  }
  const toolInvocation = rawPart.toolInvocation;
  if (isRecord(toolInvocation)) {
    const nested =
      typeof toolInvocation.toolName === "string"
        ? toolInvocation.toolName.trim()
        : "";
    if (nested) {
      return nested;
    }
  }
  if (typeof rawPart.type === "string" && rawPart.type.startsWith("tool-")) {
    const inferred = rawPart.type.slice("tool-".length).trim();
    if (inferred && inferred !== "invocation") {
      return inferred;
    }
  }
  return null;
}

function resolveTranscriptDynamicToolCallId(
  rawPart: Record<string, unknown>,
  toolPartIndex: number
): string | null {
  if (
    typeof rawPart.toolCallId === "string" &&
    rawPart.toolCallId.trim().length > 0
  ) {
    return rawPart.toolCallId.trim();
  }
  if (
    typeof rawPart.toolName === "string" &&
    rawPart.toolName.trim().length > 0
  ) {
    return `tool-call-${toolPartIndex}`;
  }
  return null;
}

function partsFromTranscriptParts(
  transcriptParts: unknown[],
  toolResults: Map<string, IndexedToolResult>,
  toolCallArgsById: Map<string, unknown> = new Map()
): CopilotMessagePart[] {
  const parts: CopilotMessagePart[] = [];
  let toolPartIndex = 0;
  for (const rawPartEntry of transcriptParts) {
    if (!isRecord(rawPartEntry) || typeof rawPartEntry.type !== "string") {
      continue;
    }
    const rawPart = flattenTranscriptToolPart(rawPartEntry);
    if (rawPart.type === "text" && typeof rawPart.text === "string") {
      parts.push({ type: "text", text: rawPart.text });
      continue;
    }
    const mastraToolName = resolveWireToolNameFromTranscriptPart(rawPart);
    if (mastraToolName) {
      const toolCallId = resolveTranscriptDynamicToolCallId(
        { ...rawPart, toolName: mastraToolName },
        toolPartIndex
      );
      toolPartIndex += 1;
      if (!toolCallId) {
        continue;
      }
      parts.push(
        dynamicToolPartFromIndexedResult(
          toolCallId,
          mastraToolName,
          resolveTranscriptToolInput(
            rawPart,
            toolResults,
            toolCallArgsById.get(toolCallId)
          ),
          toolResults.get(toolCallId) ??
            indexedResultFromTranscriptPart({
              ...rawPart,
              toolName: mastraToolName,
            }),
          rawPart
        )
      );
    }
  }
  return mergeDynamicToolPartsInOrder(parts) as CopilotMessagePart[];
}

function textFromCopilotParts(parts: readonly CopilotMessagePart[]): string {
  return parts
    .flatMap((part) =>
      part.type === "text" && typeof part.text === "string" ? [part.text] : []
    )
    .join("\n")
    .trim();
}

function assistantProsePrecedesMergedTools(
  parts: readonly CopilotMessagePart[]
): boolean {
  return parts.some(
    (part) =>
      part.type === "dynamic-tool" &&
      "toolName" in part &&
      part.toolName === "requestDecision" &&
      part.state === "output-available"
  );
}

/** Live SSE may append `content` while persisted `transcript_parts` only list tools. */
function mergeAssistantContentStringIntoParts(
  parts: CopilotMessagePart[],
  content: string | undefined
): CopilotMessagePart[] {
  if (typeof content !== "string" || content.length === 0) {
    return parts;
  }
  const streamed = content.trim();
  if (!streamed) {
    return parts;
  }
  const fromParts = textFromCopilotParts(parts);
  if (fromParts === streamed) {
    return parts;
  }
  if (streamed.length > fromParts.length || fromParts.length === 0) {
    const withoutText = parts.filter((part) => part.type !== "text");
    const textPart = { type: "text", text: content } as CopilotMessagePart;
    if (assistantProsePrecedesMergedTools(withoutText)) {
      return [textPart, ...withoutText];
    }
    return [...withoutText, textPart];
  }
  return parts;
}

function partsFromAssistantMessage(
  message: Extract<Message, { role: "assistant" }>,
  toolResults: Map<string, IndexedToolResult>
): CopilotMessagePart[] {
  const transcriptParts = readTranscriptParts(message);
  if (transcriptParts && transcriptParts.length > 0) {
    const toolCallArgsById = new Map<string, unknown>(
      readAssistantToolCalls(message).map((toolCall) => [
        toolCall.id,
        safeJson(toolCall.function.arguments),
      ])
    );
    return mergeAssistantContentStringIntoParts(
      partsFromTranscriptParts(transcriptParts, toolResults, toolCallArgsById),
      typeof message.content === "string" ? message.content : undefined
    );
  }

  const parts: CopilotMessagePart[] = [];
  for (const toolCall of readAssistantToolCalls(message)) {
    const args = safeJson(toolCall.function.arguments);
    parts.push(
      dynamicToolPartFromIndexedResult(
        toolCall.id,
        toolCall.function.name,
        args,
        toolResults.get(toolCall.id)
      )
    );
  }
  if (typeof message.content === "string" && message.content.length > 0) {
    parts.push({ type: "text", text: message.content });
  }
  return mergeDynamicToolPartsInOrder(parts) as CopilotMessagePart[];
}

function partsFromAgUiMessage(
  message: Message,
  toolResults: Map<string, IndexedToolResult>
): CopilotMessagePart[] {
  if (message.role === "assistant") {
    return partsFromAssistantMessage(message, toolResults);
  }
  if (message.role === "user") {
    if (Array.isArray(message.content)) {
      return message.content.filter(isUIMessagePart) as CopilotMessagePart[];
    }
    return [{ type: "text", text: message.content }];
  }
  return [];
}

export function agUiMessagesToCopilotMessages(
  messages: readonly Message[]
): CopilotPanelContentProps["messages"] {
  const orderedMessages = sortAgUiMessagesForTranscript(messages);
  const toolResults = indexToolResults(orderedMessages);
  const assistantToolCallIds = new Set<string>();

  for (const message of orderedMessages) {
    if (message.role !== "assistant") {
      continue;
    }
    for (const toolCall of readAssistantToolCalls(message)) {
      assistantToolCallIds.add(toolCall.id);
    }
  }

  const copilotMessages: CopilotPanelContentProps["messages"][number][] = [];
  let orphanToolGroup: {
    id: string;
    parts: CopilotMessagePart[];
  } | null = null;

  const flushOrphanToolGroup = () => {
    if (!orphanToolGroup) {
      return;
    }
    copilotMessages.push({
      id: orphanToolGroup.id,
      role: "assistant",
      parts: orphanToolGroup.parts,
    });
    orphanToolGroup = null;
  };

  for (const message of orderedMessages) {
    if (message.role === "tool") {
      const result = parseToolResultMessage(message);
      if (!result || assistantToolCallIds.has(result.toolCallId)) {
        continue;
      }
      const orphanPart = dynamicToolPartFromIndexedResult(
        result.toolCallId,
        result.toolName,
        result.input ?? {},
        result
      );
      const lastCopilotMessage = copilotMessages.at(-1);
      if (lastCopilotMessage?.role === "assistant") {
        lastCopilotMessage.parts = mergeDynamicToolPartsInOrder([
          ...((lastCopilotMessage.parts as CopilotMessagePart[]) ?? []),
          orphanPart,
        ]) as CopilotMessagePart[];
        continue;
      }
      orphanToolGroup ??= {
        id: `orphan-tools-${message.id}`,
        parts: [],
      };
      orphanToolGroup.parts = mergeDynamicToolPartsInOrder([
        ...orphanToolGroup.parts,
        orphanPart,
      ]) as CopilotMessagePart[];
      continue;
    }
    if (message.role !== "assistant" && message.role !== "user") {
      continue;
    }
    if (
      message.role === "user" &&
      isToolApprovalResumeNudgeText(agUiMessageText(message))
    ) {
      continue;
    }
    flushOrphanToolGroup();
    copilotMessages.push({
      id: message.id,
      role: message.role,
      parts: partsFromAgUiMessage(message, toolResults),
    });
  }
  flushOrphanToolGroup();

  return copilotMessages;
}
