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
 * and objects in the ember tint. In running text it takes real room on both
 * sides. In the composer it must not: the backdrop has to advance exactly
 * like the plain textarea above it, or the caret drifts — so there the
 * padding is cancelled by an equal negative margin and paints 2px into the
 * spaces around the token; the composer's word spacing keeps a gap.
 */
export function mentionPillClassName(
  entity: string,
  placement: "composer" | "text"
): string {
  return cn(
    "rounded-full box-decoration-clone py-0.5",
    // Bold would widen the glyphs and move the caret off the textarea's.
    placement === "composer"
      ? "-mx-[2px] px-[2px]"
      : "mx-px px-1.5 font-medium",
    entity === "ai:agent"
      ? "bg-primary/15 text-primary"
      : "bg-ember-tint text-ember-strong"
  );
}
