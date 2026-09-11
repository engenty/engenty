/**
 * Simple markdown for table cells: marks and lists, no block chrome.
 * Stores markdown, not HTML.
 */
import { Button, cn } from "@engenty/ui-core";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Code,
  Italic,
  List,
  ListOrdered,
  Strikethrough,
} from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";

function readMarkdown(editor: unknown): string {
  return (
    (editor as { getMarkdown?: () => string } | null)?.getMarkdown?.() ?? ""
  );
}

function MarkButton({
  active,
  children,
  label,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      aria-label={label}
      className="size-7 p-0"
      onClick={onClick}
      size="sm"
      type="button"
      variant={active ? "secondary" : "ghost"}
    >
      {children}
    </Button>
  );
}

export function TableMarkdownEditor({
  autoFocus,
  className,
  minHeightClassName = "min-h-24",
  onBlur,
  onChange,
  onCommitKey,
  placeholder,
  value,
}: {
  autoFocus?: boolean;
  className?: string;
  minHeightClassName?: string;
  onBlur?: () => void;
  onChange: (markdown: string) => void;
  onCommitKey?: () => void;
  placeholder?: string;
  value: string;
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onCommitKeyRef = useRef(onCommitKey);
  onCommitKeyRef.current = onCommitKey;
  const rootRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    autofocus: autoFocus ? "end" : false,
    content: value,
    contentType: "markdown",
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm dark:prose-invert max-w-none focus:outline-none",
          "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p+p]:mt-1.5 [&_p]:my-0",
          "[&_ol]:my-1 [&_ul]:my-1",
          minHeightClassName
        ),
      },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          onCommitKeyRef.current?.();
          return true;
        }
        return false;
      },
    },
    extensions: [
      StarterKit.configure({
        blockquote: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        link: {
          autolink: true,
          openOnClick: false,
        },
      }),
      Markdown.configure({
        markedOptions: { gfm: true },
      }),
    ],
  });

  useEffect(() => {
    if (!editor) {
      return;
    }
    const handleUpdate = ({ editor: current }: { editor: unknown }) => {
      onChangeRef.current(readMarkdown(current));
    };
    editor.on("update", handleUpdate);
    return () => {
      editor.off("update", handleUpdate);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }
    if (readMarkdown(editor) === value) {
      return;
    }
    editor.commands.setContent(value, { contentType: "markdown" });
  }, [editor, value]);

  if (!editor) {
    return (
      <div
        className={cn(
          "rounded-md bg-input/30 px-2.5 py-1.5 text-muted-foreground text-sm",
          minHeightClassName,
          className
        )}
      >
        {placeholder}
      </div>
    );
  }

  return (
    <div
      className={cn("relative min-w-0", className)}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) {
          return;
        }
        window.setTimeout(() => {
          const active = document.activeElement;
          if (
            rootRef.current?.contains(active) ||
            (active instanceof HTMLElement &&
              active.closest(
                "[data-tippy-root], [data-radix-popper-content-wrapper]"
              ))
          ) {
            return;
          }
          onBlur?.();
        }, 100);
      }}
      ref={rootRef}
    >
      <BubbleMenu
        editor={editor}
        options={{ placement: "top" }}
        shouldShow={({ editor: current }) => {
          const { from, to } = current.state.selection;
          return from !== to && current.isEditable;
        }}
      >
        <div
          className="flex items-center gap-px rounded-md border bg-popover p-0.5 shadow-md"
          onMouseDown={(event) => event.preventDefault()}
        >
          <MarkButton
            active={editor.isActive("bold")}
            label="Bold"
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold className="size-3.5" />
          </MarkButton>
          <MarkButton
            active={editor.isActive("italic")}
            label="Italic"
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic className="size-3.5" />
          </MarkButton>
          <MarkButton
            active={editor.isActive("strike")}
            label="Strikethrough"
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough className="size-3.5" />
          </MarkButton>
          <MarkButton
            active={editor.isActive("code")}
            label="Code"
            onClick={() => editor.chain().focus().toggleCode().run()}
          >
            <Code className="size-3.5" />
          </MarkButton>
          <MarkButton
            active={editor.isActive("bulletList")}
            label="Bullet list"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List className="size-3.5" />
          </MarkButton>
          <MarkButton
            active={editor.isActive("orderedList")}
            label="Numbered list"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className="size-3.5" />
          </MarkButton>
        </div>
      </BubbleMenu>
      <EditorContent editor={editor} />
    </div>
  );
}
