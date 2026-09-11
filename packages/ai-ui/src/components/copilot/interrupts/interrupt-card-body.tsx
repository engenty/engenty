"use client";

import { cn } from "@engenty/ui-core";
import { COMPACT_MARKDOWN_PROSE_CLASSNAME } from "../../../lib/admin/compact-markdown-prose-classname";
import { MessageResponse } from "../../ai-elements/message.js";

/**
 * The body of an interrupt card (decision, feedback), rendered as markdown
 * inside a capped, scrollable box.
 *
 * Bodies are agent-authored and can be long — a hire proposal carries the
 * whole instruction block. As one `<p>` the newlines collapsed into a wall of
 * text and the card grew to fill the screen, pushing the choices below the
 * fold. Markdown keeps the author's structure; the cap keeps the choices in
 * view.
 */
export function InterruptCardBody(props: { body: string; className?: string }) {
  return (
    <div
      className={cn(
        "max-h-64 overflow-y-auto pr-1 text-muted-foreground",
        COMPACT_MARKDOWN_PROSE_CLASSNAME,
        props.className
      )}
    >
      <MessageResponse>{props.body}</MessageResponse>
    </div>
  );
}
