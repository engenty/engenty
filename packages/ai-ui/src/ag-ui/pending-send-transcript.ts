import type { AgentTurnMessageLike } from "@engenty/ag-ui-bridge";
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

/** Pending send is redundant once the canonical transcript contains that user turn. */
function isPendingSendReflectedInCopilotMessages(
  messages: readonly PendingSendTranscriptMessage[],
  pendingText: string
): boolean {
  const trimmed = pendingText.trim();
  if (!trimmed || messages.length === 0) {
    return false;
  }
  return messages.some(
    (message) =>
      message.role === "user" && copilotUserMessageText(message) === trimmed
  );
}

/** Text for a pending user bubble rendered outside canonical `messages[]`. */
export function resolvePendingUserTextForTranscript(
  messages: readonly PendingSendTranscriptMessage[],
  pendingSend: EngentyAgUiPendingSend
): string | null {
  if (!pendingSend) {
    return null;
  }
  const text = pendingSend.text.trim();
  if (!text || isPendingSendReflectedInCopilotMessages(messages, text)) {
    return null;
  }
  return text;
}

/** Where to render the pending user bubble while assistant content streams in. */
export function resolvePendingUserInsertIndex(
  messages: readonly PendingSendTranscriptMessage[],
  pendingSend: EngentyAgUiPendingSend
): number | null {
  if (
    !(pendingSend && resolvePendingUserTextForTranscript(messages, pendingSend))
  ) {
    return null;
  }
  const insertIndex =
    typeof pendingSend.transcriptInsertIndex === "number" &&
    Number.isFinite(pendingSend.transcriptInsertIndex)
      ? pendingSend.transcriptInsertIndex
      : 0;
  return Math.max(0, Math.min(insertIndex, messages.length));
}
