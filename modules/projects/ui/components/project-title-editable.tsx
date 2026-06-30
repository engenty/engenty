import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { Pencil } from "lucide-react";
import { useEffect, useRef } from "react";

export interface ProjectTitleEditableProps {
  editingTitle: boolean;
  onCancelTitle: () => void;
  onSaveTitle: () => void;
  onStartEditTitle: () => void;
  onTitleChange: (value: string) => void;
  title: string;
  titleValue: string;
}

/**
 * Inline-editable project title for the `DetailPageHeader` title slot. Renders
 * inline (no own heading element) so it sits inside the header's `h1` and
 * inherits its typography — click the title or the pencil to edit in place.
 */
export function ProjectTitleEditable({
  editingTitle,
  title,
  titleValue,
  onTitleChange,
  onStartEditTitle,
  onSaveTitle,
  onCancelTitle,
}: ProjectTitleEditableProps) {
  const { t } = useTranslation("projects");
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!(editingTitle && ref.current)) {
      return;
    }
    if (ref.current.textContent !== titleValue) {
      ref.current.textContent = titleValue;
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
  }, [editingTitle, titleValue]);

  if (editingTitle) {
    return (
      <span
        aria-label={t("detail.editTitleLabel")}
        className="block min-w-[200px] outline-none focus:outline-none"
        contentEditable
        dir="ltr"
        onBlur={onSaveTitle}
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
        aria-label={t("detail.editTitle")}
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
