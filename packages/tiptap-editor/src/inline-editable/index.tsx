/**
 * InlineEditableRichText — General-purpose rich text with optional click-to-edit.
 *
 * When `readOnlyFilledPreview` is true and content is non-empty, preview is a
 * plain surface so links work; a dedicated edit control (shown on hover or
 * keyboard focus) enters edit mode. Empty state still uses click-to-edit (or
 * emptyState card).
 */

import Typography from "@tiptap/extension-typography";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

/* ── Utilities ── */

function sanitizeHtml(html: string | undefined | null): string {
  if (!html) {
    return "";
  }
  return html.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    ""
  );
}

function stripHtmlTags(html: string | undefined | null): string {
  if (!html) {
    return "";
  }
  return html.replace(/<[^>]*>?/gm, "");
}

const OVERLAY_SELECTOR =
  '[role="dialog"], [role="menu"], [data-radix-popper-content-wrapper]';

function createBlurCloseHandler(onClose: () => void) {
  return (e: React.FocusEvent) => {
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (relatedTarget?.closest(OVERLAY_SELECTOR)) {
      return;
    }
    setTimeout(() => {
      const active = document.activeElement as HTMLElement | null;
      if (!active?.closest(OVERLAY_SELECTOR)) {
        onClose();
      }
    }, 100);
  };
}

/* ── Extensions (minimal for short brief: no headings) ── */

function getInlineBriefExtensions(placeholder: string) {
  return [
    StarterKit.configure({
      heading: false,
      codeBlock: false,
      blockquote: false,
      horizontalRule: false,
      link: {
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { class: "tiptap-link" },
      },
    }),
    Placeholder.configure({ placeholder }),
    Typography,
  ];
}

/* ── Types ── */

export interface InlineEditableRichTextEmptyState {
  description?: string;
  icon?: ReactNode;
  title: string;
}

export interface InlineEditableRichTextProps {
  /** Optional extra class for container */
  className?: string;
  /** Current HTML content */
  content: string;
  /** Whether editing is disabled */
  disabled?: boolean;
  /** Empty state shown when content is empty (card with icon, title, description) */
  emptyState?: InlineEditableRichTextEmptyState;
  /** Accessible label for the edit control when `readOnlyFilledPreview` is used */
  filledPreviewEditLabel?: string;
  /** Callback when content changes (fires on every edit) */
  onChange?: (content: string) => void;
  /** Callback when leaving edit mode (blur) — use to persist */
  onSave?: (content: string) => void;
  /** Placeholder when empty (used when emptyState is not provided) */
  placeholder?: string;
  /**
   * When true and HTML content is non-empty, preview is not click-to-edit (links
   * stay clickable). Use the edit control to enter edit mode.
   */
  readOnlyFilledPreview?: boolean;
  /** "top" = fixed toolbar, "floating" = bubble menu on selection (offer-style) */
  toolbarVariant?: "top" | "floating";
}

/* ── Component ── */

function PencilEditIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      focusable="false"
      height="18"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="18"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>Edit</title>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

export function InlineEditableRichText({
  content,
  emptyState,
  onChange,
  onSave,
  placeholder = "Click to add content…",
  toolbarVariant = "top",
  disabled = false,
  className = "",
  readOnlyFilledPreview = false,
  filledPreviewEditLabel = "Edit content",
}: InlineEditableRichTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showFloatingToolbar, setShowFloatingToolbar] = useState(false);
  const [toolbarPosition, setToolbarPosition] = useState({ left: 0, top: 0 });
  const hasAutoFocusedRef = useRef(false);
  const editorRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: getInlineBriefExtensions(placeholder),
    content: content || "",
    editable: !disabled,
    autofocus: false,
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor: e }) => {
      onChange?.(e.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "tiptap prose prose-sm dark:prose-invert max-w-none focus:outline-none text-sm [&_*:last-child]:mb-0 [&_p:last-child]:mb-0",
      },
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || "", {
        emitUpdate: false,
      });
    }
  }, [content, editor]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [disabled, editor]);

  useEffect(() => {
    if (editor && isEditing && !hasAutoFocusedRef.current) {
      editor.commands.focus("end");
      hasAutoFocusedRef.current = true;
    }
    if (!isEditing) {
      hasAutoFocusedRef.current = false;
    }
  }, [editor, isEditing]);

  useEffect(() => {
    if (!editor || toolbarVariant !== "floating" || disabled) {
      return;
    }
    const updateToolbar = () => {
      const { from, to } = editor.state.selection;
      const hasSelection = from !== to;
      if (hasSelection) {
        const domSelection = window.getSelection();
        if (domSelection?.rangeCount) {
          const range = domSelection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          const editorRect = editorRef.current?.getBoundingClientRect();
          if (editorRect) {
            const toolbarWidth = 280;
            const toolbarHeight = 40;
            const padding = 8;
            let top = rect.top - editorRect.top - toolbarHeight - 8;
            let left =
              rect.left - editorRect.left + rect.width / 2 - toolbarWidth / 2;
            if (top < padding) {
              top = rect.bottom - editorRect.top + 8;
            }
            const minLeft = padding;
            const maxLeft = editorRect.width - toolbarWidth - padding;
            left = Math.max(minLeft, Math.min(maxLeft, left));
            setToolbarPosition({ left, top });
            setShowFloatingToolbar(true);
          }
        }
      } else {
        setShowFloatingToolbar(false);
      }
    };
    editor.on("selectionUpdate", updateToolbar);
    editor.on("update", updateToolbar);
    return () => {
      editor.off("selectionUpdate", updateToolbar);
      editor.off("update", updateToolbar);
    };
  }, [editor, disabled, toolbarVariant]);

  const isPreview = disabled || !isEditing;
  const isFloatingSurface = toolbarVariant === "floating";

  if (isPreview) {
    const displayContent = content;
    const hasContent =
      displayContent && stripHtmlTags(displayContent).trim().length > 0;

    if (readOnlyFilledPreview && hasContent) {
      const filledPreviewClass =
        "tiptap-inline-editable-filled-preview tiptap-inline-editable-preview prose prose-sm dark:prose-invert min-w-0 max-w-none text-left text-sm [&_*:last-child]:mb-0 [&_p:last-child]:mb-0 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 tiptap";
      const body = (
        <div
          className={
            disabled ? filledPreviewClass : `${filledPreviewClass} flex-1`
          }
          dangerouslySetInnerHTML={{
            __html: sanitizeHtml(displayContent),
          }}
        />
      );
      if (disabled) {
        return <div className={`min-w-0 ${className}`}>{body}</div>;
      }
      return (
        <div
          className={`group/filled-brief flex min-w-0 items-start gap-2 ${className}`}
        >
          {body}
          <button
            aria-label={filledPreviewEditLabel}
            className="-mt-0.5 -mr-0.5 shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-[color,opacity] hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover/filled-brief:opacity-100"
            onClick={() => setIsEditing(true)}
            type="button"
          >
            <PencilEditIcon />
          </button>
        </div>
      );
    }

    const baseButtonClass =
      "tiptap-inline-editable-preview prose prose-sm dark:prose-invert w-full max-w-none cursor-pointer rounded-md text-left text-sm transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-60 [&_*:last-child]:mb-0 [&_p:last-child]:mb-0";
    const isEmptyCard = !hasContent && emptyState && !disabled;
    const surfaceClass = isEmptyCard
      ? "flex flex-col items-center justify-center gap-2 border border-border border-dashed bg-muted/30 px-4 py-8 hover:bg-muted/50"
      : isFloatingSurface
        ? "bg-transparent p-0 hover:bg-input/30 [&_p]:m-0"
        : "bg-input/30 px-3 py-2 hover:bg-input/60";

    return (
      <button
        aria-label={emptyState?.title ?? "Edit content"}
        className={`${baseButtonClass} ${surfaceClass} ${className}`}
        disabled={disabled}
        onMouseDown={(e) => {
          e.preventDefault();
          if (!disabled) {
            setIsEditing(true);
          }
        }}
        type="button"
      >
        {hasContent ? (
          <span
            className="block [&>*:last-child]:mb-0 [&>p:last-child]:mb-0"
            dangerouslySetInnerHTML={{
              __html: sanitizeHtml(displayContent),
            }}
          />
        ) : emptyState && !disabled ? (
          <span className="flex flex-col items-center gap-2 text-center">
            {emptyState.icon ? (
              <span className="text-muted-foreground">{emptyState.icon}</span>
            ) : null}
            <span className="font-medium text-foreground">
              {emptyState.title}
            </span>
            {emptyState.description ? (
              <span className="text-muted-foreground text-xs">
                {emptyState.description}
              </span>
            ) : null}
          </span>
        ) : (
          <span
            className="block [&>*:last-child]:mb-0 [&>p:last-child]:mb-0"
            dangerouslySetInnerHTML={{
              __html: `<p class="text-muted-foreground m-0">${placeholder}</p>`,
            }}
          />
        )}
      </button>
    );
  }

  const handleBlurClose = () => {
    const html = editor?.getHTML() ?? "";
    onSave?.(html);
    setIsEditing(false);
  };

  const toolbarButtons = (
    <>
      <button
        className={`tiptap-toolbar-btn h-7 w-7 min-w-0 shrink-0 rounded p-0 ${editor?.isActive("bold") ? "is-active" : ""}`}
        onClick={() => editor?.chain().focus().toggleBold().run()}
        title="Bold"
        type="button"
      >
        B
      </button>
      <button
        className={`tiptap-toolbar-btn h-7 w-7 min-w-0 shrink-0 rounded p-0 ${editor?.isActive("italic") ? "is-active" : ""}`}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
        title="Italic"
        type="button"
      >
        I
      </button>
      <button
        className={`tiptap-toolbar-btn h-7 w-7 min-w-0 shrink-0 rounded p-0 ${editor?.isActive("underline") ? "is-active" : ""}`}
        onClick={() => editor?.chain().focus().toggleUnderline().run()}
        title="Underline"
        type="button"
      >
        U
      </button>
      <button
        className={`tiptap-toolbar-btn h-7 w-7 min-w-0 shrink-0 rounded p-0 ${editor?.isActive("strike") ? "is-active" : ""}`}
        onClick={() => editor?.chain().focus().toggleStrike().run()}
        title="Strikethrough"
        type="button"
      >
        S
      </button>
      <span className="mx-0.5 h-4 w-px bg-border" />
      <button
        className={`tiptap-toolbar-btn h-7 w-7 min-w-0 shrink-0 rounded p-0 ${editor?.isActive("bulletList") ? "is-active" : ""}`}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
        title="Bullet list"
        type="button"
      >
        •
      </button>
      <button
        className={`tiptap-toolbar-btn h-7 w-7 min-w-0 shrink-0 rounded p-0 ${editor?.isActive("orderedList") ? "is-active" : ""}`}
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        title="Ordered list"
        type="button"
      >
        1.
      </button>
    </>
  );

  const showTopToolbar = toolbarVariant === "top";
  const showFloating = toolbarVariant === "floating" && showFloatingToolbar;

  const editorSurfaceClass = isFloatingSurface
    ? "bg-transparent transition-colors hover:bg-input/30 focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-0"
    : "bg-input/30 transition-colors focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-0 hover:bg-input/60";

  return (
    <div
      className={`tiptap-inline-editable-editor relative rounded-md ${editorSurfaceClass} ${className}`}
      onBlur={createBlurCloseHandler(handleBlurClose)}
      ref={editorRef}
      role="group"
    >
      {showTopToolbar && (
        <div className="flex flex-wrap items-center gap-px border-border-soft border-b px-1 py-0.5">
          {toolbarButtons}
        </div>
      )}
      {showFloating && (
        <div
          className="absolute z-50 flex items-center gap-px rounded border bg-muted/50 px-1 py-0.5 shadow-lg"
          onMouseDown={(e) => e.preventDefault()}
          role="toolbar"
          style={{
            left: `${toolbarPosition.left}px`,
            top: `${toolbarPosition.top}px`,
          }}
        >
          {toolbarButtons}
        </div>
      )}
      <div
        className={isFloatingSurface ? "relative p-0" : "relative px-3 py-2"}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
