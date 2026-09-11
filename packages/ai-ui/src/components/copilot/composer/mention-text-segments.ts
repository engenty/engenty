// The `@Name` tokens of picked references inside a text, and the pill they
// are drawn as — shared by the composer's backdrop (while typing) and the
// transcript's user bubble (once sent), so a mention looks the same in both.

import { cn } from "@engenty/ui-core";
import type { ChatReferenceItem } from "../../../lib/chat-reference-part";

export interface MentionTextSegment {
  ref: ChatReferenceItem | null;
  text: string;
}

/** Split a text into plain runs and `@Label` tokens of picked references. */
export function segmentMentionText(
  text: string,
  refs: readonly ChatReferenceItem[]
): MentionTextSegment[] {
  const tokens = refs
    .map((ref) => ({ ref, token: `@${ref.label}` }))
    .filter((entry) => entry.token.length > 1)
    // Longest first so "@Inbox Assist" never claims "@Inbox Assistant".
    .sort((a, b) => b.token.length - a.token.length);
  const segments: MentionTextSegment[] = [];
  let plainStart = 0;
  let cursor = 0;
  while (cursor < text.length) {
    if (text[cursor] !== "@") {
      cursor += 1;
      continue;
    }
    const hit = tokens.find((entry) => text.startsWith(entry.token, cursor));
    if (!hit) {
      cursor += 1;
      continue;
    }
    if (cursor > plainStart) {
      segments.push({ ref: null, text: text.slice(plainStart, cursor) });
    }
    segments.push({ ref: hit.ref, text: hit.token });
    cursor += hit.token.length;
    plainStart = cursor;
  }
  if (plainStart < text.length) {
    segments.push({ ref: null, text: text.slice(plainStart) });
  }
  return segments;
}

/** True when the text still carries the reference's `@Label` token. */
export function draftMentionsRef(text: string, ref: ChatReferenceItem) {
  return text.includes(`@${ref.label}`);
}

/**
 * The pill's look, by what it points at: agents in the primary tint, people
 * and objects in the secondary one. It grows downwards and upwards only —
 * block padding on an inline box paints outside the line without moving it,
 * while any horizontal padding or ring would both drift the composer backdrop
 * off the plain textarea's metrics and paint over the space next to the
 * token, so a mention would read as glued to the word after it.
 */
export function mentionPillClassName(entity: string): string {
  return cn(
    "rounded-sm box-decoration-clone py-[3px]",
    entity === "ai:agent"
      ? "bg-primary/15 text-primary"
      : "bg-secondary text-secondary-foreground"
  );
}
