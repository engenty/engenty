"use client";

import type { ObjectRef } from "@engenty/ai-core/browser";
import { formatObjectRef } from "@engenty/ai-core/browser";
import { Button, cn } from "@engenty/ui-core";
import { MessageSquareQuote, Sparkles } from "lucide-react";
import { type RefObject, useEffect, useState } from "react";
import { useObjectDisplayIntent } from "./object-display-intent.js";

/**
 * Slim panel→chat affordance (docs/wip/generative-ui.md §3.3): "Ask the agent
 * to…" prefills the composer with the record's ref so "raise the daily rate"
 * resolves against the open document, and a text selection inside the panel
 * can be quoted into the composer. Renders nothing when the surface provides
 * no `askAgent` (drawer chat, plain pages) — same absent-handler contract as
 * the rest of ObjectDisplayIntent.
 */

export interface ObjectPanelAskAgentBarProps {
  className?: string;
  /** Panel content container watched for text selections to quote. */
  contentRef?: RefObject<HTMLElement | null>;
  /** Human-readable record label used in the prefilled prompt. */
  label?: string;
  objectRef: ObjectRef;
  /** Optional canned prompts rendered as chips. */
  suggestions?: Array<{ label: string; prompt: string }>;
}

function useSelectionWithin(ref?: RefObject<HTMLElement | null>): string {
  const [selection, setSelection] = useState("");

  useEffect(() => {
    if (!ref) {
      return;
    }
    const readSelection = () => {
      // Read the ref inside the listener — the container mounts after the
      // first render, and selectionchange only ever fires post-mount.
      const container = ref.current;
      const current = document.getSelection();
      const text = current?.toString().trim() ?? "";
      if (
        !(text && container && current) ||
        current.rangeCount === 0 ||
        !container.contains(current.getRangeAt(0).commonAncestorContainer)
      ) {
        setSelection("");
        return;
      }
      setSelection(text);
    };
    document.addEventListener("selectionchange", readSelection);
    return () => document.removeEventListener("selectionchange", readSelection);
  }, [ref]);

  return selection;
}

export function ObjectPanelAskAgentBar({
  className,
  contentRef,
  label,
  objectRef,
  suggestions,
}: ObjectPanelAskAgentBarProps) {
  const { askAgent } = useObjectDisplayIntent();
  const selection = useSelectionWithin(contentRef);

  if (!askAgent) {
    return null;
  }

  const refString = formatObjectRef(objectRef);
  const subject = label ? `${label} (${refString})` : refString;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 border-border/60 border-t bg-background/95 px-3 py-2",
        className
      )}
    >
      <Button
        className="h-7 gap-1.5 px-2 text-muted-foreground text-xs hover:text-foreground"
        onClick={() => askAgent(`${subject}: `, objectRef)}
        size="sm"
        variant="ghost"
      >
        <Sparkles className="size-3.5" />
        Ask the agent to…
      </Button>
      {(suggestions ?? []).map((suggestion) => (
        <Button
          className="h-7 rounded-full px-2.5 text-muted-foreground text-xs hover:text-foreground"
          key={suggestion.label}
          onClick={() => askAgent(suggestion.prompt, objectRef)}
          size="sm"
          variant="outline"
        >
          {suggestion.label}
        </Button>
      ))}
      {selection ? (
        <Button
          className="h-7 gap-1.5 rounded-full px-2.5 text-muted-foreground text-xs hover:text-foreground"
          onClick={() =>
            askAgent(`${subject} — regarding "${selection}": `, objectRef)
          }
          size="sm"
          variant="outline"
        >
          <MessageSquareQuote className="size-3.5" />
          Ask about selection
        </Button>
      ) : null}
    </div>
  );
}
