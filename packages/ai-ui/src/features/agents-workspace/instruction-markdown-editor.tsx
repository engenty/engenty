import { Button, Separator, Textarea } from "@engenty/ui-core";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Code2,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type InstructionEditorMode = "wysiwyg" | "source";
export type InstructionEditorToolbarVariant = "top" | "floating";

interface InstructionMarkdownEditorProps {
  disabled?: boolean;
  mode: InstructionEditorMode;
  onChange: (markdown: string) => void;
  placeholder: string;
  toolbarVariant?: InstructionEditorToolbarVariant;
  value: string;
}

function getMarkdown(editor: unknown) {
  return (
    (
      editor as {
        getMarkdown?: () => string;
      } | null
    )?.getMarkdown?.() ?? ""
  );
}

export function InstructionMarkdownEditor({
  disabled = false,
  mode,
  onChange,
  placeholder,
  toolbarVariant = "top",
  value,
}: InstructionMarkdownEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [isFocused, setIsFocused] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Markdown.configure({
        markedOptions: { gfm: true },
      }),
    ],
    content: value,
    contentType: "markdown",
    editable: !disabled,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert min-h-[26rem] max-w-none focus:outline-none [&>*:first-child]:mt-0",
      },
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    const handleUpdate = ({ editor: currentEditor }: { editor: unknown }) => {
      onChangeRef.current(getMarkdown(currentEditor));
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

    if (getMarkdown(editor) === value) {
      return;
    }

    editor.commands.setContent(value, {
      contentType: "markdown",
    });
  }, [editor, value]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const handleFocus = () => setIsFocused(true);
    const handleBlur = () => setIsFocused(false);

    editor.on("focus", handleFocus);
    editor.on("blur", handleBlur);

    return () => {
      editor.off("focus", handleFocus);
      editor.off("blur", handleBlur);
    };
  }, [editor]);

  if (mode === "source") {
    return (
      <Textarea
        className="min-h-[26rem] font-mono text-sm"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    );
  }

  if (!editor) {
    return (
      <div className="rounded-md bg-input/30">
        <div className="min-h-[26rem] text-muted-foreground text-sm">
          {placeholder}
        </div>
      </div>
    );
  }

  const toolbarButtons = (
    <>
      <Button
        onClick={() => editor.chain().focus().undo().run()}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Undo2 className="h-4 w-4" />
      </Button>
      <Button
        onClick={() => editor.chain().focus().redo().run()}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Redo2 className="h-4 w-4" />
      </Button>
      <Separator className="mx-1 h-6" orientation="vertical" />
      <Button
        onClick={() => editor.chain().focus().toggleBold().run()}
        size="sm"
        type="button"
        variant={editor.isActive("bold") ? "secondary" : "ghost"}
      >
        <Bold className="h-4 w-4" />
      </Button>
      <Button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        size="sm"
        type="button"
        variant={editor.isActive("italic") ? "secondary" : "ghost"}
      >
        <Italic className="h-4 w-4" />
      </Button>
      <Separator className="mx-1 h-6" orientation="vertical" />
      <Button
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        size="sm"
        type="button"
        variant={
          editor.isActive("heading", { level: 1 }) ? "secondary" : "ghost"
        }
      >
        <Heading1 className="h-4 w-4" />
      </Button>
      <Button
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        size="sm"
        type="button"
        variant={
          editor.isActive("heading", { level: 2 }) ? "secondary" : "ghost"
        }
      >
        <Heading2 className="h-4 w-4" />
      </Button>
      <Separator className="mx-1 h-6" orientation="vertical" />
      <Button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        size="sm"
        type="button"
        variant={editor.isActive("bulletList") ? "secondary" : "ghost"}
      >
        <List className="h-4 w-4" />
      </Button>
      <Button
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        size="sm"
        type="button"
        variant={editor.isActive("orderedList") ? "secondary" : "ghost"}
      >
        <ListOrdered className="h-4 w-4" />
      </Button>
      <Button
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        size="sm"
        type="button"
        variant={editor.isActive("blockquote") ? "secondary" : "ghost"}
      >
        <Quote className="h-4 w-4" />
      </Button>
      <Button
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        size="sm"
        type="button"
        variant={editor.isActive("codeBlock") ? "secondary" : "ghost"}
      >
        <Code2 className="h-4 w-4" />
      </Button>
    </>
  );

  return (
    <div
      className={[
        "overflow-hidden rounded-md bg-input/30 transition-colors hover:bg-input/60",
        isFocused ? "bg-input/60 ring-1 ring-ring ring-offset-0" : "",
      ].join(" ")}
    >
      {toolbarVariant === "top" ? (
        <div className="flex flex-wrap items-center gap-1 border-b bg-muted/20 p-2">
          {toolbarButtons}
        </div>
      ) : null}
      <div>
        {toolbarVariant === "floating" ? (
          <BubbleMenu
            editor={editor}
            options={{ placement: "top" }}
            shouldShow={({ editor: currentEditor }) => {
              const { from, to } = currentEditor.state.selection;
              return from !== to && currentEditor.isEditable;
            }}
            tippyOptions={{
              animation: "shift-away",
              duration: 150,
            }}
          >
            <div className="flex items-center gap-1 rounded-md border bg-background/95 p-1 shadow-md backdrop-blur">
              {toolbarButtons}
            </div>
          </BubbleMenu>
        ) : null}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
