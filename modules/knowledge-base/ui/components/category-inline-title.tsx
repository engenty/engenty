/**
 * Notion-style inline-editable category title.
 *
 * - Renders as a large heading.
 * - Clicking the heading flips to an unstyled input.
 * - Enter or blur commits via `useUpdateCategoryMutation`.
 * - Escape reverts the draft.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { useEffect, useRef, useState } from "react";
import type { KbCategory } from "../../src/schema/types.js";
import { useUpdateCategoryMutation } from "../queries.js";

interface CategoryInlineTitleProps {
  category: KbCategory;
  /** When false, render a static heading (view mode). */
  editable?: boolean;
  /** Render light text on cover (image/dark) backgrounds. */
  onCover?: boolean;
}

export function CategoryInlineTitle({
  category,
  editable = true,
  onCover,
}: CategoryInlineTitleProps) {
  const { t } = useTranslation("kb");
  const mutation = useUpdateCategoryMutation(category.kb_id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(category.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(category.name);
    }
  }, [category.name, editing]);

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
    const next = draft.trim();
    setEditing(false);
    if (!next || next === category.name) {
      setDraft(category.name);
      return;
    }
    mutation.mutate({ id: category.id, input: { name: next } });
  }

  if (!editable) {
    return (
      <h1
        className={cn(
          "min-w-0 truncate px-1 font-heading font-semibold text-[28px] leading-9 tracking-tight",
          onCover ? "text-white" : "text-foreground"
        )}
      >
        {category.name || t("category.title_placeholder")}
      </h1>
    );
  }

  if (editing) {
    return (
      <input
        className={cn(
          "w-full min-w-0 bg-transparent px-1 font-heading font-semibold text-[28px] leading-9 tracking-tight outline-none placeholder:text-muted-foreground/60",
          onCover ? "text-white" : "text-foreground"
        )}
        maxLength={256}
        onBlur={commit}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(category.name);
            setEditing(false);
          }
        }}
        placeholder={t("category.title_placeholder")}
        ref={inputRef}
        type="text"
        value={draft}
      />
    );
  }

  return (
    <button
      className={cn(
        "min-w-0 truncate rounded-sm bg-transparent px-1 py-0.5 text-left font-heading font-semibold text-[28px] leading-9 tracking-tight outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring",
        onCover ? "text-white" : "text-foreground"
      )}
      onClick={() => setEditing(true)}
      title={t("category.title_edit_hint")}
      type="button"
    >
      {category.name || t("category.title_placeholder")}
    </button>
  );
}
