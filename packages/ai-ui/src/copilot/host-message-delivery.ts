/**
 * A handoff remains parked until its exact user turn reaches the transcript.
 * In-flight sends are not delivery: first-send thread binding can remount the
 * host before hydration, and clearing early would lose the message.
 */
export type PendingHostMessageSubmitDecision =
  | { type: "idle" }
  | { type: "wait" }
  | { type: "submit"; text: string }
  | { type: "complete" };

export function decidePendingHostMessageSubmit(input: {
  delivered: boolean;
  isLoadingMessages?: boolean;
  isTransportReady: boolean;
  kicked: boolean;
  parkedText: string | null;
  pendingSendText: string | null;
  status: string;
}): PendingHostMessageSubmitDecision {
  const parked = input.parkedText;
  if (!parked?.trim()) {
    return { type: "idle" };
  }
  if (input.delivered) {
    return { type: "complete" };
  }
  if (input.kicked || input.isLoadingMessages) {
    return { type: "wait" };
  }
  if (
    input.pendingSendText ||
    input.status !== "ready" ||
    !input.isTransportReady
  ) {
    return { type: "wait" };
  }
  return { type: "submit", text: parked };
}

function userMessageText(message: {
  content?: unknown;
  parts?: unknown;
  role?: string;
}): string {
  if (message.role !== "user") {
    return "";
  }
  const chunks: string[] = [];
  const parts = Array.isArray(message.parts) ? message.parts : [];
  for (const part of parts) {
    if (!part || typeof part !== "object") {
      continue;
    }
    const record = part as Record<string, unknown>;
    if (record.type === "text" && typeof record.text === "string") {
      chunks.push(record.text);
    }
  }
  if (chunks.length > 0) {
    return chunks.join("\n");
  }
  return typeof message.content === "string" ? message.content : "";
}

/** True when the exact parked text is already a user turn in the transcript. */
export function pendingHostMessageDelivered(
  parkedText: string | null,
  messages: readonly { content?: unknown; parts?: unknown; role?: string }[]
): boolean {
  if (!parkedText?.trim()) {
    return false;
  }
  return messages.some((message) => userMessageText(message) === parkedText);
}
