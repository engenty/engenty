// AG-UI message mapping for persisted session rows and Mastra UI projection (Stage 4).
// Row-based builders remain for HTTP list endpoints; harness snapshots prefer MessageList.
import type { RunAgentInput } from "@engenty/ag-ui-bridge";
import { isToolApprovalResumeNudgeText } from "./tool-approval-resume-nudge.js";

type AgUiMessageBase = RunAgentInput["messages"][number];

type Message = AgUiMessageBase & {
  metadata?: Record<string, unknown>;
};

type AssistantMessage = Extract<Message, { role: "assistant" }>;

export interface PersistedAgUiSessionMessageRecord {
  author_name?: string | null;
  author_user_id?: string | null;
  client_message_id?: string | null;
  created_at?: string;
  id: string;
  metadata?: Record<string, unknown>;
  parts: unknown;
  role: "assistant" | "system" | "tool" | "user";
  run_id?: string | null;
  seq?: number;
}

/** Canonical transcript order for persisted rows (never rely on random UUID ordering). */
export function sortPersistedAgUiSessionMessageRecords<
  T extends PersistedAgUiSessionMessageRecord,
>(records: readonly T[]): T[] {
  return [...records].sort((left, right) => {
    const leftTime = left.created_at?.trim() ?? "";
    const rightTime = right.created_at?.trim() ?? "";
    if (leftTime && rightTime && leftTime !== rightTime) {
      return leftTime.localeCompare(rightTime);
    }
    return left.id.localeCompare(right.id);
  });
}

export function readAgUiMessageCreatedAt(message: Message): string | null {
  if (!isRecord(message.metadata)) {
    return null;
  }
  const createdAt = message.metadata.created_at;
  return typeof createdAt === "string" && createdAt.trim()
    ? createdAt.trim()
    : null;
}

export function readAgUiMessageTranscriptIndex(
  message: Message
): number | null {
  if (!isRecord(message.metadata)) {
    return null;
  }
  const transcriptIndex = message.metadata.transcript_index;
  return typeof transcriptIndex === "number" && Number.isFinite(transcriptIndex)
    ? transcriptIndex
    : null;
}

/** Stable sort for hydrated/snapshot AG-UI rows; tool rows without timestamps keep stream order. */
export function sortAgUiMessagesForTranscript(
  messages: readonly Message[]
): Message[] {
  return [...messages]
    .map((message, index) => ({ index, message }))
    .sort((left, right) => {
      const leftIndex = readAgUiMessageTranscriptIndex(left.message);
      const rightIndex = readAgUiMessageTranscriptIndex(right.message);
      if (leftIndex != null && rightIndex != null && leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }
      const leftTime = readAgUiMessageCreatedAt(left.message);
      const rightTime = readAgUiMessageCreatedAt(right.message);
      if (leftTime && rightTime && leftTime !== rightTime) {
        return leftTime.localeCompare(rightTime);
      }
      if (leftIndex != null && rightIndex == null) {
        return -1;
      }
      if (leftIndex == null && rightIndex != null) {
        return 1;
      }
      return left.index - right.index;
    })
    .map(({ message }) => message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function extractTextFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) {
    return "";
  }
  return parts
    .flatMap((part) =>
      isRecord(part) &&
      (part.type === "text" || part.type === "reasoning") &&
      typeof part.text === "string"
        ? [part.text]
        : []
    )
    .join("\n")
    .trim();
}

function safeStringify(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value ?? null) ?? "null";
  } catch {
    return String(value);
  }
}

function partsToAgUiContent(parts: unknown): Message["content"] {
  if (!Array.isArray(parts)) {
    return "";
  }
  const inputParts = parts.filter((part) => {
    if (!isRecord(part) || typeof part.type !== "string") {
      return false;
    }
    return ["text", "image", "audio", "video", "document", "binary"].includes(
      part.type
    );
  });
  return inputParts.length > 0 ? (inputParts as Message["content"]) : "";
}

interface NormalizedPersistedToolPart {
  input?: unknown;
  output?: unknown;
  state?: string;
  toolCallId: string;
  toolName: string;
}

function readPersistedToolCallId(
  part: Record<string, unknown>,
  index: number
): string {
  if (typeof part.toolCallId === "string" && part.toolCallId.trim()) {
    return part.toolCallId.trim();
  }
  const toolInvocation = part.toolInvocation;
  if (
    isRecord(toolInvocation) &&
    typeof toolInvocation.toolCallId === "string" &&
    toolInvocation.toolCallId.trim()
  ) {
    return toolInvocation.toolCallId.trim();
  }
  return `tool-call-${index}`;
}

function normalizePersistedToolPart(
  part: Record<string, unknown>,
  index: number
): NormalizedPersistedToolPart | null {
  const type = typeof part.type === "string" ? part.type : "";
  if (type === "dynamic-tool") {
    const toolName =
      typeof part.toolName === "string" ? part.toolName.trim() : "";
    if (!toolName) {
      return null;
    }
    return {
      input: part.input,
      output: part.output,
      state: typeof part.state === "string" ? part.state : undefined,
      toolCallId: readPersistedToolCallId(part, index),
      toolName,
    };
  }
  if (type === "tool-invocation" && isRecord(part.toolInvocation)) {
    const toolInvocation = part.toolInvocation;
    const toolName =
      typeof toolInvocation.toolName === "string"
        ? toolInvocation.toolName.trim()
        : "";
    if (!toolName) {
      return null;
    }
    const nestedState = toolInvocation.state;
    const state =
      nestedState === "result" || nestedState === "done"
        ? "output-available"
        : typeof nestedState === "string"
          ? nestedState
          : undefined;
    return {
      input: toolInvocation.args ?? toolInvocation.input,
      output: toolInvocation.result ?? toolInvocation.output,
      state,
      toolCallId: readPersistedToolCallId(part, index),
      toolName,
    };
  }
  if (type.startsWith("tool-")) {
    const toolName = type.slice("tool-".length).trim();
    if (!toolName || toolName === "invocation") {
      return null;
    }
    return {
      input: part.input,
      output: part.output,
      state: typeof part.state === "string" ? part.state : undefined,
      toolCallId: readPersistedToolCallId(part, index),
      toolName,
    };
  }
  return null;
}

function dynamicToolPartsToToolResultMessages(
  parts: unknown,
  assistantMessageId: string,
  createdAt?: string
): Message[] {
  if (!Array.isArray(parts)) {
    return [];
  }
  const messages: Message[] = [];
  let index = 0;
  for (const part of parts) {
    if (!isRecord(part)) {
      continue;
    }
    const normalized = normalizePersistedToolPart(part, index);
    index += 1;
    if (!normalized) {
      continue;
    }
    const state = normalized.state;
    if (
      state !== "output-available" &&
      state !== "output-error" &&
      normalized.output === undefined
    ) {
      continue;
    }
    messages.push({
      id: `${assistantMessageId}-tool-${normalized.toolCallId}`,
      role: "tool",
      toolCallId: normalized.toolCallId,
      content: safeStringify(normalized.output),
      ...(createdAt ? { metadata: { created_at: createdAt } } : {}),
      ...(state === "output-error" ? { error: true } : {}),
    } as unknown as Message);
  }
  return messages;
}

function dynamicToolPartsToToolCalls(
  parts: unknown
): AssistantMessage["toolCalls"] {
  if (!Array.isArray(parts)) {
    return;
  }
  const calls: NonNullable<AssistantMessage["toolCalls"]> = [];
  let toolIndex = 0;
  for (const part of parts) {
    if (!isRecord(part)) {
      continue;
    }
    const normalized = normalizePersistedToolPart(part, toolIndex);
    toolIndex += 1;
    if (!normalized) {
      continue;
    }
    calls.push({
      id: normalized.toolCallId,
      type: "function",
      function: {
        name: normalized.toolName,
        arguments: safeStringify(normalized.input ?? {}),
      },
    });
  }
  return calls.length > 0 ? calls : undefined;
}

function firstToolPart(parts: unknown): Record<string, unknown> | null {
  if (!Array.isArray(parts)) {
    return null;
  }
  return (
    parts.find(
      (part) =>
        isRecord(part) &&
        (part.type === "dynamic-tool" ||
          (typeof part.type === "string" && part.type.startsWith("tool-")))
    ) ?? null
  );
}

export function agUiMessageText(message: Message): string {
  if (typeof message.content === "string") {
    return message.content.trim();
  }
  if (Array.isArray(message.content)) {
    return message.content
      .flatMap((part: unknown) =>
        isRecord(part) && part.type === "text" && typeof part.text === "string"
          ? [part.text]
          : []
      )
      .join("\n")
      .trim();
  }
  return "";
}

export function withTranscriptMetadata(
  metadata: Record<string, unknown>,
  transcriptIndex: number
): Record<string, unknown> {
  return {
    ...metadata,
    transcript_index: transcriptIndex,
  };
}

export function buildAgUiMessagesFromSessionMessages(
  records: readonly PersistedAgUiSessionMessageRecord[],
  options?: { preserveInputOrder?: boolean }
): Message[] {
  let transcriptIndex = 0;
  const nextTranscriptIndex = () => transcriptIndex++;

  const orderedRecords = options?.preserveInputOrder
    ? [...records]
    : sortPersistedAgUiSessionMessageRecords(records);

  const messages = orderedRecords.flatMap((record) => {
    const id = record.client_message_id?.trim() || record.id;
    const metadata = {
      ...(record.metadata ?? {}),
      ...(record.run_id ? { run_id: record.run_id } : {}),
      ...(record.seq === undefined ? {} : { seq: record.seq }),
      ...(record.created_at ? { created_at: record.created_at } : {}),
      ...(record.author_user_id
        ? { author_user_id: record.author_user_id }
        : {}),
      ...(record.author_name ? { author_name: record.author_name } : {}),
    };
    if (record.role === "tool") {
      const toolPart = firstToolPart(record.parts);
      const toolCallId =
        (typeof toolPart?.toolCallId === "string" && toolPart.toolCallId) ||
        record.id;
      return [
        {
          id,
          role: "tool" as const,
          toolCallId,
          content: safeStringify(toolPart?.output ?? record.parts),
          metadata: withTranscriptMetadata(metadata, nextTranscriptIndex()),
        } as Message,
      ];
    }
    if (record.role === "assistant") {
      const content = extractTextFromParts(record.parts);
      const toolCalls = dynamicToolPartsToToolCalls(record.parts);
      const assistantMetadata = withTranscriptMetadata(
        {
          ...metadata,
          ...(Array.isArray(record.parts) && record.parts.length > 0
            ? { transcript_parts: record.parts }
            : {}),
        },
        nextTranscriptIndex()
      );
      const assistantMessage = {
        id,
        role: "assistant" as const,
        ...(content ? { content } : {}),
        ...(toolCalls ? { toolCalls } : {}),
        metadata: assistantMetadata,
      } as Message;
      const toolMessages = dynamicToolPartsToToolResultMessages(
        record.parts,
        id,
        record.created_at
      ).map((message) => ({
        ...message,
        metadata: withTranscriptMetadata(
          {
            ...(isRecord(message.metadata) ? message.metadata : {}),
            ...(record.created_at ? { created_at: record.created_at } : {}),
          },
          nextTranscriptIndex()
        ),
      }));
      return [assistantMessage, ...toolMessages];
    }
    if (record.role === "user") {
      // Tool-approval re-runs used to persist the model-steering nudge as a
      // user row. The Approve/Deny widget already records the verdict — drop
      // the duplicate bubble on hydrate / MESSAGES_SNAPSHOT.
      if (isToolApprovalResumeNudgeText(extractTextFromParts(record.parts))) {
        return [];
      }
      const content = partsToAgUiContent(record.parts);
      return [
        {
          id,
          role: "user" as const,
          content,
          metadata: withTranscriptMetadata(metadata, nextTranscriptIndex()),
        } as Message,
      ];
    }
    return [
      {
        id,
        role: "system" as const,
        content: extractTextFromParts(record.parts),
        metadata: withTranscriptMetadata(metadata, nextTranscriptIndex()),
      } as Message,
    ];
  });

  return sortAgUiMessagesForTranscript(messages);
}

export function normalizeAgUiMessageForPersistence(message: Message): {
  client_message_id: string | null;
  parts: unknown[];
  role: "assistant" | "system" | "tool" | "user";
  text: string;
  toolCallId?: string;
} | null {
  if (message.role === "developer" || message.role === "activity") {
    return null;
  }
  if (message.role === "tool") {
    return {
      client_message_id: message.id || null,
      parts: [
        {
          type: "dynamic-tool",
          toolCallId: message.toolCallId,
          toolName: "frontend_tool",
          state: message.error ? "output-error" : "output-available",
          output: message.content,
        },
      ],
      role: "tool",
      text: message.content,
      toolCallId: message.toolCallId,
    };
  }
  const content = message.content;
  const parts =
    Array.isArray(content) && message.role === "user"
      ? content
      : [{ type: "text", text: typeof content === "string" ? content : "" }];
  const role = message.role === "reasoning" ? "assistant" : message.role;
  return {
    client_message_id: message.id || null,
    parts,
    role,
    text: agUiMessageText(message),
  };
}

/** Thread terminology alias — same shape as session message records. */
export type PersistedAgUiThreadMessageRecord =
  PersistedAgUiSessionMessageRecord;

export const sortPersistedAgUiThreadMessageRecords =
  sortPersistedAgUiSessionMessageRecords;

export const buildAgUiMessagesFromThreadMessages =
  buildAgUiMessagesFromSessionMessages;
