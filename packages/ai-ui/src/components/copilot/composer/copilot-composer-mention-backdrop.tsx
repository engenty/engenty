"use client";

import { cn } from "@engenty/ui-core";
import type { RefObject } from "react";
import type { ChatReferenceItem } from "../../../lib/chat-reference-part";
import {
  mentionPillClassName,
  segmentMentionText,
} from "./mention-text-segments";

export {
  draftMentionsRef,
  type MentionTextSegment,
  segmentMentionText,
} from "./mention-text-segments";

/**
 * Inline pills for picked @-mentions in a plain `<textarea>`.
 *
 * A textarea cannot style a range of its own text, so this layer sits under
 * it with the same metrics and paints the same characters: the textarea's
 * text is transparent (caret and selection stay), and each `@Label` token of
 * a picked reference is wrapped in a pill. The pill takes no horizontal room,
 * so the token advances exactly like the plain text in the textarea above —
 * any metric drift would show as a misaligned caret.
 */
export function CopilotComposerMentionBackdrop({
  backdropRef,
  className,
  refs,
  text,
}: {
  backdropRef: RefObject<HTMLDivElement | null>;
  /** The textarea's typography classes — padding, size, leading. */
  className: string;
  refs: readonly ChatReferenceItem[];
  text: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words text-foreground",
        className
      )}
      ref={backdropRef}
    >
      {segmentMentionText(text, refs).map((segment, index) =>
        segment.ref ? (
          <span
            className={mentionPillClassName(segment.ref.entity, "composer")}
            key={index}
          >
            {segment.text}
          </span>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
      {/* A trailing newline needs a visible line box to keep the height. */}
      {text.endsWith("\n") ? "\u200b" : null}
    </div>
  );
}
