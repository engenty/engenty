import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { Pencil } from "lucide-react";
import { useEffect, useRef } from "react";

export interface ProjectTitleEditableProps {
  editAriaLabel?: string;
  editingTitle: boolean;
  editLabel?: string;
  onCancelTitle: () => void;
  onSaveTitle: () => void;
  onStartEditTitle: () => void;
  onTitleChange: (value: string) => void;
  title: string;
  titleValue: string;
}

/**
 * Inline-editable title: click the text or the hover pencil to edit in place.
 * Used in the project `DetailPageHeader` (inherits `h1` type) and the phase
 * side panel. Renders inline — no own heading element.
 */
export function ProjectTitleEditable({
  editAriaLabel,
  editingTitle,
  editLabel,
  title,
  titleValue,
  onTitleChange,
  onStartEditTitle,
  onSaveTitle,
  onCancelTitle,
}: ProjectTitleEditableProps) {
  const { t } = useTranslation("projects");
  const ref = useRef<HTMLSpanElement>(null);
  const titleValueRef = useRef(titleValue);
  titleValueRef.current = titleValue;

  useEffect(() => {
    if (!(editingTitle && ref.current)) {
      return;
    }
    const next = titleValueRef.current;
    if (ref.current.textContent !== next) {
      ref.current.textContent = next;
    }
    ref.current.focus();
    const range = document.createRange();
    const sel = window.getSelection();
    if (sel && ref.current.firstChild) {
      range.selectNodeContents(ref.current);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, [editingTitle]);

  if (editingTitle) {
    return (
      <span
        aria-label={editAriaLabel ?? t("detail.editTitleLabel")}
        className="block min-w-[200px] outline-none focus:outline-none"
        contentEditable
        dir="ltr"
        onBlur={() => {
          window.setTimeout(onSaveTitle, 0);
        }}
        onInput={(e) => onTitleChange(e.currentTarget.textContent ?? "")}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancelTitle();
          } else if (e.key === "Enter") {
            e.preventDefault();
            onSaveTitle();
          }
        }}
        ref={ref}
        role="textbox"
        suppressContentEditableWarning
        suppressHydrationWarning
      />
    );
  }

  return (
    <span className="group inline-flex items-center gap-2">
      <button
        className="cursor-pointer text-left"
        onClick={onStartEditTitle}
        type="button"
      >
        {title}
      </button>
      <Button
        aria-label={editLabel ?? t("detail.editTitle")}
        className="opacity-0 transition-opacity group-hover:opacity-100"
        onClick={onStartEditTitle}
        size="sm"
        type="button"
        variant="link"
      >
        <Pencil className="h-4 w-4" />
      </Button>
    </span>
  );
}
