// Speaker tags for Mastra multi-user threads. Applied at model assembly only —
// persisted parts stay plain text so AG-UI bubbles never show the tags.
import type { MastraDBMessage } from "@mastra/core/agent";
import type { Processor } from "@mastra/core/processors";
import { resolveUserDisplayNames } from "./user-display-names.js";

export const SPEAKER_TURN_PROCESSOR_NAME = "engenty-speaker-turns";

export const SHARED_ROOM_INSTRUCTIONS = `## Shared conversation
Several people, and possibly other agents, talk in this thread. Each human turn is wrapped as:
<turn author_id="…" author_name="…" functional_role="user">…</turn>
An agent's turn begins with **Message from <name>** and names its engenty id.
Address people by author_name and agents by name. Do not echo the tags or invent authors.

You talk in three places. Your desk is the team's: everyone in the Space reads it. A room is a job with members: named, with a purpose, read by its members. A direct message is one person's private line with you: only they read it. What was said in a direct message stays there — never repeat it on the desk or in a room; when a person asks you in private for something the team should see, say so and offer to open a room.`;

export function wrapUserTurnText(input: {
  authorId: string;
  authorName: string;
  text: string;
}): string {
  if (input.text.includes("<turn ")) {
    return input.text;
  }
  return `<turn author_id="${xmlAttr(input.authorId)}" author_name="${xmlAttr(input.authorName)}" functional_role="user">\n${input.text}\n</turn>`;
}

function xmlAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * The human speaker on a Mastra message, when one was recorded.
 *
 * Distinguishes three cases:
 * - a user id → a person wrote this
 * - `null` → `author_user_id` was stored as empty (headless / synthetic)
 * - `undefined` → the field was never written (live turn or a legacy row)
 */
export function readMastraAuthorUserId(
  message: unknown
): string | null | undefined {
  if (!message || typeof message !== "object") {
    return;
  }
  const record = message as {
    content?: { metadata?: Record<string, unknown> };
    metadata?: Record<string, unknown>;
  };
  const metadata = record.content?.metadata ?? record.metadata;
  if (!(metadata && "author_user_id" in metadata)) {
    return;
  }
  const value = metadata.author_user_id;
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return null;
}

/**
 * Mastra's memory `resourceId` is the Space (or thread) on shared rooms — not
 * the speaker. Prefer a persisted `author_user_id`, then a user-keyed
 * resourceId, then the authenticated caller — but never invent a speaker when
 * the row already recorded that there isn't one.
 */
export function speakerUserIdFromMastraMessage(
  message: {
    content?: unknown;
    resourceId?: string;
    threadId?: string;
  },
  fallbackUserId: string | null,
  options?: { spaceId?: string | null }
): string | null {
  const spaceId = options?.spaceId?.trim() ?? "";
  const threadId =
    typeof message.threadId === "string" ? message.threadId.trim() : "";
  const fromMeta = readMastraAuthorUserId(message);
  if (fromMeta) {
    if (fromMeta !== threadId && fromMeta !== spaceId) {
      return fromMeta;
    }
    return fallbackUserId?.trim() || null;
  }
  if (fromMeta === null) {
    return null;
  }
  const resourceId =
    typeof message.resourceId === "string" ? message.resourceId.trim() : "";
  if (resourceId && resourceId !== threadId && resourceId !== spaceId) {
    return resourceId;
  }
  return fallbackUserId?.trim() || null;
}

function wrapMessageText(
  message: MastraDBMessage,
  wrap: (text: string) => string
): MastraDBMessage {
  const content = message.content as
    | { parts?: Array<{ text?: string; type?: string }> }
    | undefined;
  const parts = content?.parts;
  if (!Array.isArray(parts)) {
    return message;
  }
  return {
    ...message,
    content: {
      ...content,
      parts: parts.map((part) =>
        part.type === "text" && typeof part.text === "string"
          ? { ...part, text: wrap(part.text) }
          : part
      ),
    },
  } as MastraDBMessage;
}

export function createSpeakerTurnProcessor(input: {
  currentUserId: string | null;
  currentUserName?: string;
  resolveNames?: (userIds: string[]) => Promise<Map<string, string>>;
  spaceId?: string | null;
}): Processor {
  const resolveNames = input.resolveNames ?? resolveUserDisplayNames;
  const speakerOptions = input.spaceId?.trim()
    ? { spaceId: input.spaceId.trim() }
    : undefined;
  const fallbackUserId = input.currentUserId?.trim() || null;
  return {
    id: SPEAKER_TURN_PROCESSOR_NAME,
    name: SPEAKER_TURN_PROCESSOR_NAME,
    processInput: async ({ messages }) => {
      const userMessages = messages.filter(
        (message) => message.role === "user"
      );
      const authorIds = [
        ...new Set(
          userMessages.flatMap((message) => {
            const authorId = speakerUserIdFromMastraMessage(
              message,
              fallbackUserId,
              speakerOptions
            );
            return authorId ? [authorId] : [];
          })
        ),
      ];
      const names =
        authorIds.length > 0 ? await resolveNames(authorIds) : new Map();
      if (fallbackUserId && input.currentUserName?.trim()) {
        names.set(fallbackUserId, input.currentUserName.trim());
      }
      return messages.map((message) => {
        if (message.role !== "user") {
          return message;
        }
        const authorId = speakerUserIdFromMastraMessage(
          message,
          fallbackUserId,
          speakerOptions
        );
        if (!authorId) {
          return message;
        }
        const authorName = names.get(authorId) ?? "Member";
        return wrapMessageText(message, (text) =>
          wrapUserTurnText({ authorId, authorName, text })
        );
      });
    },
  };
}
