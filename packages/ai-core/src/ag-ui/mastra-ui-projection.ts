import type { RunAgentInput } from "@engenty/ag-ui-bridge";
import {
  sortAgUiMessagesForTranscript,
  withTranscriptMetadata,
} from "./ag-ui-messages.js";

type Message = RunAgentInput["messages"][number];

export interface MastraUiMessagePart {
  error?: string;
  input?: unknown;
  output?: unknown;
  state?: string;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  type: string;
}

export interface MastraUiMessage {
  id: string;
  metadata?: Record<string, unknown>;
  parts: MastraUiMessagePart[];
  role: "assistant" | "system" | "user";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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

function readMastraUiCreatedAt(message: MastraUiMessage): string | undefined {
  const createdAt = message.metadata?.createdAt;
  if (createdAt instanceof Date) {
    return createdAt.toISOString();
  }
  return typeof createdAt === "string" && createdAt.trim()
    ? createdAt.trim()
    : undefined;
}

function extractTextFromParts(parts: MastraUiMessagePart[]): string {
  return parts
    .flatMap((part) =>
      part.type === "text" && typeof part.text === "string" ? [part.text] : []
    )
    .join("\n")
    .trim();
}

function partsToAgUiUserContent(
  parts: MastraUiMessagePart[]
): Message["content"] {
  const inputParts = parts.filter((part) =>
    ["text", "image", "audio", "video", "document", "binary"].includes(
      part.type
    )
  );
  return inputParts.length > 0 ? (inputParts as Message["content"]) : "";
}

function resolveToolNameFromPart(part: MastraUiMessagePart): string | null {
  if (typeof part.toolName === "string" && part.toolName.trim()) {
    return part.toolName.trim();
  }
  const toolInvocation = (part as { toolInvocation?: { toolName?: string } })
    .toolInvocation;
  if (
    typeof toolInvocation?.toolName === "string" &&
    toolInvocation.toolName.trim()
  ) {
    return toolInvocation.toolName.trim();
  }
  if (part.type.startsWith("tool-")) {
    const name = part.type.slice("tool-".length).trim();
    if (name && name !== "invocation") {
      return name;
    }
  }
  return null;
}

function isToolProjectionPart(part: MastraUiMessagePart): boolean {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

function resolveToolCallId(
  part: MastraUiMessagePart,
  fallbackIndex: number
): string {
  if (typeof part.toolCallId === "string" && part.toolCallId.trim()) {
    return part.toolCallId.trim();
  }
  const toolInvocation = (part as { toolInvocation?: { toolCallId?: string } })
    .toolInvocation;
  if (
    typeof toolInvocation?.toolCallId === "string" &&
    toolInvocation.toolCallId.trim()
  ) {
    return toolInvocation.toolCallId.trim();
  }
  return `tool-call-${fallbackIndex}`;
}

function toolPartsToAgUiToolCalls(
  parts: MastraUiMessagePart[]
): Message["toolCalls"] {
  const calls: NonNullable<Message["toolCalls"]> = [];
  let toolIndex = 0;
  for (const part of parts) {
    if (!isToolProjectionPart(part)) {
      continue;
    }
    const toolName = resolveToolNameFromPart(part);
    if (!toolName) {
      continue;
    }
    calls.push({
      id: resolveToolCallId(part, toolIndex),
      type: "function",
      function: {
        name: toolName,
        arguments: safeStringify(part.input ?? {}),
      },
    });
    toolIndex += 1;
  }
  return calls.length > 0 ? calls : undefined;
}

function toolPartsToAgUiToolResultMessages(
  parts: MastraUiMessagePart[],
  assistantMessageId: string,
  createdAt?: string
): Message[] {
  const messages: Message[] = [];
  let toolIndex = 0;
  for (const part of parts) {
    if (!isToolProjectionPart(part)) {
      continue;
    }
    const state = part.state;
    if (
      state !== "output-available" &&
      state !== "output-error" &&
      part.output === undefined &&
      part.error === undefined
    ) {
      continue;
    }
    const toolCallId = resolveToolCallId(part, toolIndex);
    const toolName = resolveToolNameFromPart(part) ?? "tool";
    toolIndex += 1;
    messages.push({
      id: `${assistantMessageId}-tool-${toolCallId}`,
      role: "tool",
      toolCallId,
      content: safeStringify({
        type: "dynamic-tool",
        toolCallId,
        toolName,
        state: state ?? (part.error ? "output-error" : "output-available"),
        input: part.input,
        output: part.output ?? part.error,
      }),
      ...(createdAt ? { metadata: { created_at: createdAt } } : {}),
      ...(state === "output-error" || part.error ? { error: true } : {}),
    } as Message);
  }
  return messages;
}

// Project Mastra MessageList `aiV5.ui()` rows into official AG-UI messages.
// `transcript_parts` keeps the Mastra-native part shapes for the copilot adapter.
export function buildAgUiMessagesFromMastraUiMessages(
  messages: readonly MastraUiMessage[]
): Message[] {
  let transcriptIndex = 0;
  const nextTranscriptIndex = () => transcriptIndex++;

  const agUiMessages = messages.flatMap((message) => {
    const createdAt = readMastraUiCreatedAt(message);
    const metadata = {
      ...(createdAt ? { created_at: createdAt } : {}),
    };

    if (message.role === "assistant") {
      const content = extractTextFromParts(message.parts);
      const toolCalls = toolPartsToAgUiToolCalls(message.parts);
      const assistantMetadata = withTranscriptMetadata(
        {
          ...metadata,
          ...(message.parts.length > 0
            ? { transcript_parts: message.parts }
            : {}),
        },
        nextTranscriptIndex()
      );
      const assistantMessage = {
        id: message.id,
        role: "assistant" as const,
        ...(content ? { content } : {}),
        ...(toolCalls ? { toolCalls } : {}),
        metadata: assistantMetadata,
      } as Message;
      const toolMessages = toolPartsToAgUiToolResultMessages(
        message.parts,
        message.id,
        createdAt
      ).map((toolMessage) => ({
        ...toolMessage,
        metadata: withTranscriptMetadata(
          {
            ...(isRecord(toolMessage.metadata) ? toolMessage.metadata : {}),
            ...(createdAt ? { created_at: createdAt } : {}),
          },
          nextTranscriptIndex()
        ),
      }));
      return [assistantMessage, ...toolMessages];
    }

    if (message.role === "user") {
      return [
        {
          id: message.id,
          role: "user" as const,
          content: partsToAgUiUserContent(message.parts),
          metadata: withTranscriptMetadata(metadata, nextTranscriptIndex()),
        } as Message,
      ];
    }

    return [
      {
        id: message.id,
        role: "system" as const,
        content: extractTextFromParts(message.parts),
        metadata: withTranscriptMetadata(metadata, nextTranscriptIndex()),
      } as Message,
    ];
  });

  return sortAgUiMessagesForTranscript(agUiMessages);
}
