"use client";

// A user turn with @-mentions, drawn as the person typed it: the `@Name`
// tokens are pills inside the bubble, not chips above it. Same pill the
// composer paints while the message is being written.

import { cn } from "@engenty/ui-core";
import type { ChatReferenceItem } from "../../../lib/chat-reference-part";
import {
  mentionPillClassName,
  segmentMentionText,
} from "../composer/mention-text-segments";

/**
 * A shared-room turn is persisted inside its speaker envelope
 * (`<turn author_id=… functional_role="user">…</turn>`). The markdown
 * renderer swallows the tags as unknown HTML; plain text has to drop them.
 */
const TURN_OPEN_RE = /^\s*<turn\b[^>]*>\s*/i;
const TURN_CLOSE_RE = /\s*<\/turn>\s*$/i;

export function stripSpeakerTurnEnvelope(text: string): string {
  return text.replace(TURN_OPEN_RE, "").replace(TURN_CLOSE_RE, "");
}

export function MentionInlineText({
  className,
  refs,
  text,
}: {
  className?: string;
  refs: readonly ChatReferenceItem[];
  text: string;
}) {
  const body = stripSpeakerTurnEnvelope(text);
  return (
    <p className={cn("whitespace-pre-wrap break-words", className)}>
      {segmentMentionText(body, refs).map((segment, index) =>
        segment.ref ? (
          <span
            className={mentionPillClassName(segment.ref.entity, "text")}
            key={index}
            title={segment.ref.ref}
          >
            {segment.text}
          </span>
        ) : (
          <span key={`${index}-${segment.text.length}`}>{segment.text}</span>
        )
      )}
    </p>
  );
}
