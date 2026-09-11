// Client-side mirror of harness `appendSubAgentProgressToTranscriptParts`.
// CUSTOM `engenty.sub_agent.progress` SSE events patch `metadata.transcript_parts`
// on the in-flight assistant message so the inline card and full-page monitor
// can read `progressLines` without waiting for a snapshot reload.
//
// The lines usually arrive BEFORE the call they belong to: `@ag-ui/mastra`
// buffers a server tool's TOOL_CALL_START/ARGS/END and flushes them with the
// result, so nothing carries the tool call while the colleague works. When the
// event names its origin we open the row ourselves, on the same message the
// buffered events will land on — a delegation that takes a minute is a minute
// of "Thinking …" otherwise (live 2026-09-07, two agents playing a table).

import type { EngentyAgUiMessage } from "./conversation.js";

type Message = EngentyAgUiMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isAssistantDynamicToolPart(part: unknown): boolean {
  if (!isRecord(part)) {
    return false;
  }
  return (
    part.type === "dynamic-tool" ||
    (typeof part.type === "string" && part.type.startsWith("tool-"))
  );
}

function readTranscriptParts(message: Message): unknown[] {
  if (!isRecord(message.metadata)) {
    return [];
  }
  const parts = message.metadata.transcript_parts;
  return Array.isArray(parts) ? [...parts] : [];
}

function writeTranscriptParts(message: Message, parts: unknown[]): Message {
  return {
    ...message,
    metadata: {
      ...(isRecord(message.metadata) ? message.metadata : {}),
      transcript_parts: parts,
    },
  } as Message;
}

function seedTranscriptPartsFromToolCalls(message: Message): unknown[] {
  if (message.role !== "assistant") {
    return [];
  }
  const toolCalls = message.toolCalls ?? [];
  const parts: unknown[] = [];
  for (const toolCall of toolCalls) {
    const record = toolCall as {
      function?: { arguments?: string; name?: string };
      id?: string;
    };
    const toolName = record.function?.name?.trim() ?? "";
    const toolCallId = record.id?.trim() ?? "";
    if (!(toolName && toolCallId)) {
      continue;
    }
    let input: unknown = {};
    const args = record.function?.arguments?.trim();
    if (args) {
      try {
        input = JSON.parse(args);
      } catch {
        input = args;
      }
    }
    parts.push({
      input,
      state: "input-available",
      toolCallId,
      toolName,
      type: "dynamic-tool",
    });
  }
  return parts;
}

function appendProgressToTranscriptParts(
  parts: unknown[],
  input: { line: string; toolCallId: string }
): unknown[] {
  return parts.map((item) => {
    if (!(isRecord(item) && isAssistantDynamicToolPart(item))) {
      return item;
    }
    if (item.toolCallId !== input.toolCallId) {
      return item;
    }
    const state = item.state;
    if (state !== "input-available" && state !== "input-streaming") {
      return item;
    }
    const progressLines = [
      ...(Array.isArray(item.progressLines)
        ? (item.progressLines as string[])
        : []),
      input.line,
    ];
    return { ...item, progressLines };
  });
}

/** The message that already carries this tool call — the one to append to. */
function findMessageCarryingToolCall(
  messages: readonly Message[],
  toolCallId: string
): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant") {
      continue;
    }
    const parts = readTranscriptParts(message);
    const seeded =
      parts.length > 0 ? parts : seedTranscriptPartsFromToolCalls(message);
    const hasTool = seeded.some(
      (part) => isRecord(part) && part.toolCallId === toolCallId
    );
    if (hasTool) {
      return message.id;
    }
  }
  return null;
}

/** The in-flight assistant message — where the buffered tool events will land. */
function lastAssistantMessageId(messages: readonly Message[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") {
      return message.id ?? null;
    }
  }
  return null;
}

function openingPart(input: {
  agentId: string;
  line: string;
  toolCallId: string;
  toolName: string;
}): Record<string, unknown> {
  return {
    input: { agent_id: input.agentId },
    progressLines: [input.line],
    state: "input-available",
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    type: "dynamic-tool",
  };
}

export function appendSubAgentProgressToAgUiMessages(
  messages: readonly Message[],
  input: {
    agentId?: string | null;
    line: string;
    messageId?: string | null;
    toolCallId: string;
    toolName?: string | null;
  }
): Message[] {
  // Carrying the call and merely being the message the harness named are two
  // different things: the harness names the in-flight message from its first
  // line onward, while the call itself only lands with the result.
  const carrierId = findMessageCarryingToolCall(messages, input.toolCallId);
  const agentId = input.agentId?.trim();
  const toolName = input.toolName?.trim();
  const explicit = input.messageId?.trim();
  const namedId =
    explicit && messages.some((message) => message.id === explicit)
      ? explicit
      : lastAssistantMessageId(messages);
  const opening =
    carrierId || !(agentId && toolName)
      ? null
      : openingPart({
          agentId,
          line: input.line,
          toolCallId: input.toolCallId,
          toolName,
        });
  const targetId = carrierId ?? (opening ? namedId : null);
  if (!targetId) {
    return [...messages];
  }
  return messages.map((message) => {
    if (message.id !== targetId) {
      return message;
    }
    const existingParts = readTranscriptParts(message);
    const baseParts =
      existingParts.length > 0
        ? existingParts
        : seedTranscriptPartsFromToolCalls(message);
    const nextParts = opening
      ? [...baseParts, opening]
      : appendProgressToTranscriptParts(baseParts, input);
    return writeTranscriptParts(message, nextParts);
  });
}
