import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { useEffect, useRef, useState } from "react";

/**
 * The one line under the project title. Set, it reads as text and a click
 * edits it in place; unset, "Add subtitle…" stays hidden until the caller's
 * hover group (`revealClassName`) or `reveal` (the title is being edited)
 * shows it. Enter or blur saves — an empty line clears it — Escape cancels.
 * Without `onSave` it is read-only and renders nothing when unset.
 */
export function ProjectSubtitleEditable({
  onSave,
  reveal = false,
  revealClassName,
  subtitle,
}: {
  onSave?: (next: string | null) => void;
  /** Show the empty placeholder without hover (e.g. while the title is edited). */
  reveal?: boolean;
  /** Hover-group class that reveals the empty placeholder, e.g. `group-hover/header:opacity-60`. */
  revealClassName: string;
  subtitle: string | null | undefined;
}) {
  const { t } = useTranslation("projects");
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const current = subtitle?.trim() ? subtitle.trim() : null;

  useEffect(() => {
    if (!(editing && ref.current)) {
      return;
    }
    ref.current.textContent = current ?? "";
    ref.current.focus();
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(ref.current);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, [editing, current]);

  if (!onSave) {
    return current ? <span className="block truncate">{current}</span> : null;
  }

  const commit = () => {
    const next = ref.current?.textContent?.trim() || null;
    setEditing(false);
    if (next !== current) {
      onSave(next);
    }
  };

  // Distinct keys, as in ProjectTitleEditable: the typed text is not React's.
  if (editing) {
    return (
      <span
        aria-label={t("detail.subtitle.label")}
        className="block min-w-[200px] outline-none focus:outline-none"
        contentEditable
        dir="ltr"
        key="editing"
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
          } else if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        ref={ref}
        role="textbox"
        suppressContentEditableWarning
      />
    );
  }

  return (
    <button
      className={cn(
        "block max-w-full cursor-pointer truncate text-left",
        !current &&
          cn(
            "opacity-0 transition-opacity focus-visible:opacity-60",
            reveal ? "opacity-60" : revealClassName
          )
      )}
      key="display"
      onClick={() => setEditing(true)}
      type="button"
    >
      {current ?? t("detail.subtitle.add")}
    </button>
  );
}
