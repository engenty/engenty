// Client-side mirror of harness `appendSubAgentProgressToTranscriptParts`.
// CUSTOM `engenty.sub_agent.progress` SSE events patch `metadata.transcript_parts`
// on the in-flight assistant message so the inline card and full-page monitor
// can read `progressLines` without waiting for a snapshot reload.

import type { RunAgentInput } from "@engenty/ag-ui-bridge";

type Message = RunAgentInput["messages"][number];

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

function findTargetAssistantMessageId(
  messages: readonly Message[],
  input: { messageId?: string | null; toolCallId: string }
): string | null {
  const explicit = input.messageId?.trim();
  if (explicit && messages.some((message) => message.id === explicit)) {
    return explicit;
  }
  // Harness usually sends messageId; scan backward as a narrow fallback when it does not.
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant") {
      continue;
    }
    const parts = readTranscriptParts(message);
    const seeded =
      parts.length > 0 ? parts : seedTranscriptPartsFromToolCalls(message);
    const hasTool = seeded.some(
      (part) => isRecord(part) && part.toolCallId === input.toolCallId
    );
    if (hasTool) {
      return message.id;
    }
  }
  return null;
}

export function appendSubAgentProgressToAgUiMessages(
  messages: readonly Message[],
  input: {
    line: string;
    messageId?: string | null;
    toolCallId: string;
  }
): Message[] {
  const targetId = findTargetAssistantMessageId(messages, input);
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
    const nextParts = appendProgressToTranscriptParts(baseParts, input);
    return writeTranscriptParts(message, nextParts);
  });
}
