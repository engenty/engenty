import type { AgentTurnMessageLike } from "@engenty/ag-ui-bridge";
import { readChatAttachmentPart } from "../lib/chat-attachment-part.js";
import { readChatReferencePart } from "../lib/chat-reference-part.js";
import type { EngentyAgUiPendingSend } from "./apps-ai/use-engenty-ag-ui-apps-ai-session.js";

export type PendingSendTranscriptMessage = AgentTurnMessageLike & {
  id: string;
};

function copilotUserMessageText(message: AgentTurnMessageLike): string {
  if (message.role !== "user") {
    return "";
  }
  const chunks: string[] = [];
  for (const part of message.parts ?? []) {
    if (!part || typeof part !== "object") {
      continue;
    }
    const record = part as Record<string, unknown>;
    if (record.type === "text" && typeof record.text === "string") {
      chunks.push(record.text);
    }
  }
  if (chunks.length > 0) {
    return chunks.join("\n").trim();
  }
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    for (const part of content) {
      if (!part || typeof part !== "object") {
        continue;
      }
      const record = part as Record<string, unknown>;
      if (record.type === "text" && typeof record.text === "string") {
        chunks.push(record.text);
      }
    }
  }
  return chunks.join("\n").trim();
}

function messageContentParts(message: AgentTurnMessageLike): unknown[] {
  if (Array.isArray(message.parts) && message.parts.length > 0) {
    return message.parts;
  }
  const content = (message as { content?: unknown }).content;
  return Array.isArray(content) ? content : [];
}

function attachmentStorageKeys(parts: readonly unknown[]): string[] {
  const keys: string[] = [];
  for (const part of parts) {
    const meta = readChatAttachmentPart(part);
    if (meta?.storageKey) {
      keys.push(meta.storageKey);
    }
  }
  return keys;
}

function referenceKeys(parts: readonly unknown[]): string[] {
  const keys: string[] = [];
  for (const part of parts) {
    const refs = readChatReferencePart(part);
    if (!refs) {
      continue;
    }
    for (const item of refs) {
      keys.push(item.ref);
    }
  }
  return keys;
}

function pendingSendHasExtraParts(
  pendingSend: NonNullable<EngentyAgUiPendingSend>
): boolean {
  return Array.isArray(pendingSend.parts) && pendingSend.parts.length > 0;
}

/** Pending send is redundant once the canonical transcript contains that user turn. */
function isPendingSendReflectedInCopilotMessages(
  messages: readonly PendingSendTranscriptMessage[],
  pendingSend: NonNullable<EngentyAgUiPendingSend>
): boolean {
  const text = pendingSend.text.trim();
  if (text) {
    if (messages.length === 0) {
      return false;
    }
    return messages.some(
      (message) =>
        message.role === "user" && copilotUserMessageText(message) === text
    );
  }
  const parts = pendingSend.parts ?? [];
  const storageKeys = attachmentStorageKeys(parts);
  if (storageKeys.length > 0) {
    return messages.some((message) => {
      if (message.role !== "user") {
        return false;
      }
      const keys = attachmentStorageKeys(messageContentParts(message));
      return storageKeys.every((key) => keys.includes(key));
    });
  }
  const refs = referenceKeys(parts);
  if (refs.length === 0) {
    return false;
  }
  return messages.some((message) => {
    if (message.role !== "user") {
      return false;
    }
    const keys = referenceKeys(messageContentParts(message));
    return refs.every((key) => keys.includes(key));
  });
}

export function isPendingSendVisibleForTranscript(
  messages: readonly PendingSendTranscriptMessage[],
  pendingSend: EngentyAgUiPendingSend
): boolean {
  if (!pendingSend) {
    return false;
  }
  const text = pendingSend.text.trim();
  if (!(text || pendingSendHasExtraParts(pendingSend))) {
    return false;
  }
  return !isPendingSendReflectedInCopilotMessages(messages, pendingSend);
}

/** Text for a pending user bubble rendered outside canonical `messages[]`. */
export function resolvePendingUserTextForTranscript(
  messages: readonly PendingSendTranscriptMessage[],
  pendingSend: EngentyAgUiPendingSend
): string | null {
  if (!isPendingSendVisibleForTranscript(messages, pendingSend)) {
    return null;
  }
  const text = pendingSend?.text.trim() ?? "";
  return text || null;
}

/** Attachment / reference parts for the pending user bubble. */
export function resolvePendingUserPartsForTranscript(
  messages: readonly PendingSendTranscriptMessage[],
  pendingSend: EngentyAgUiPendingSend
): unknown[] | null {
  if (!isPendingSendVisibleForTranscript(messages, pendingSend)) {
    return null;
  }
  const parts = pendingSend?.parts;
  if (!Array.isArray(parts) || parts.length === 0) {
    return null;
  }
  return parts;
}

/** Where to render the pending user bubble while assistant content streams in. */
export function resolvePendingUserInsertIndex(
  messages: readonly PendingSendTranscriptMessage[],
  pendingSend: EngentyAgUiPendingSend
): number | null {
  if (!isPendingSendVisibleForTranscript(messages, pendingSend)) {
    return null;
  }
  const insertIndex =
    typeof pendingSend?.transcriptInsertIndex === "number" &&
    Number.isFinite(pendingSend.transcriptInsertIndex)
      ? pendingSend.transcriptInsertIndex
      : 0;
  return Math.max(0, Math.min(insertIndex, messages.length));
}
