// Canonical searchable text for a chat session (retrieval-service Phase 5a).
//
// One document per session: title + summary + role-prefixed transcript,
// compacted through `compactSearchText`. The central retrieval service owns
// chunking (paragraph splitter) and embedding; this module only decides what
// text represents a session. Tool messages are excluded — they carry
// machine payloads, not conversation content.

import { compactSearchText } from "@engenty/search-index";
import type {
  ThreadMessageRole,
  ThreadMessageRow,
  ThreadRow,
} from "../threads/index.js";

type SearchableThreadMessageRow = ThreadMessageRow & {
  role: Exclude<ThreadMessageRole, "tool">;
};

function messagePartsToText(parts: unknown): string {
  if (typeof parts === "string") {
    return parts.trim();
  }
  if (Array.isArray(parts)) {
    return parts
      .map((part) => {
        if (!part || typeof part !== "object") {
          return "";
        }
        const text = (part as { text?: unknown }).text;
        return typeof text === "string" ? text.trim() : "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  if (parts && typeof parts === "object") {
    const text = (parts as { text?: unknown }).text;
    if (typeof text === "string") {
      return text.trim();
    }
    return JSON.stringify(parts);
  }
  return "";
}

function isSearchableMessage(
  message: ThreadMessageRow
): message is SearchableThreadMessageRow {
  return (
    message.role === "assistant" ||
    message.role === "system" ||
    message.role === "user"
  );
}

/**
 * Build the canonical search text for one chat session. Returns an empty
 * string when the session has no searchable content (the retrieval source
 * treats that as "remove from index").
 */
export function buildChatSessionSearchText(
  session: ThreadRow,
  messages: ThreadMessageRow[]
): string {
  const transcript = messages
    .filter(isSearchableMessage)
    .map((message) => ({
      role: message.role,
      text: messagePartsToText(message.parts),
    }))
    .filter((message) => message.text.length > 0)
    .map((message) => `${message.role}: ${message.text}`)
    .join("\n\n");
  return compactSearchText([session.title, session.summary, transcript]);
}
