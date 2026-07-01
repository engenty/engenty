/**
 * Inline-editable block headline (categories / articles blocks).
 */

import { cn } from "@engenty/ui-core";
import { useEffect, useRef, useState } from "react";
import { kbHubSectionHeadingClassName } from "../../lib/kb-page-shell.js";

interface KbPageBlockHeadlineProps {
  defaultLabel: string;
  editable?: boolean;
  headline: string | null;
  onCommit: (headline: string | null) => void;
}

export function KbPageBlockHeadline({
  defaultLabel,
  editable = false,
  headline,
  onCommit,
}: KbPageBlockHeadlineProps) {
  const stored = headline;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(stored ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(stored ?? "");
    }
  }, [stored, editing]);

  useEffect(() => {
    if (editing) {
      const id = requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) {
          el.focus();
          el.select();
        }
      });
      return () => cancelAnimationFrame(id);
    }
  }, [editing]);

  function commit() {
    const trimmed = draft.trim();
    setEditing(false);
    const nextHeadline = trimmed.length > 0 ? trimmed : null;
    if (nextHeadline === stored) {
      return;
    }
    onCommit(nextHeadline);
  }

  const display = stored?.trim().length ? stored : defaultLabel;

  if (!editable) {
    return (
      <h2
        className={cn(
          kbHubSectionHeadingClassName,
          "min-w-0 truncate",
          !stored?.trim().length && "text-muted-foreground"
        )}
      >
        {display}
      </h2>
    );
  }

  if (editing) {
    return (
      <input
        className="w-full min-w-0 bg-transparent font-medium text-foreground text-lg outline-none placeholder:text-muted-foreground/60"
        maxLength={256}
        onBlur={commit}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(stored ?? "");
            setEditing(false);
          }
        }}
        placeholder={defaultLabel}
        ref={inputRef}
        type="text"
      />
    );
  }

  return (
    <button
      className={cn(
        "min-w-0 truncate rounded-sm bg-transparent px-0 py-0 text-left font-medium text-lg outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring",
        !stored?.trim().length && "text-muted-foreground"
      )}
      onClick={() => setEditing(true)}
      type="button"
    >
      {display}
    </button>
  );
}
