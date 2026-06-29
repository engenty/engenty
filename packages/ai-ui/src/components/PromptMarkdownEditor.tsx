import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef } from "react";

interface PromptMarkdownEditorProps {
  className?: string;
  disabled?: boolean;
  minHeight?: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  value: string;
}

export function PromptMarkdownEditor({
  value,
  onChange,
  placeholder,
  disabled = false,
  className,
  minHeight = "120px",
}: PromptMarkdownEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
      }),
      Markdown.configure({
        markedOptions: { gfm: true },
      }),
    ],
    content: value || "",
    contentType: "markdown",
    editable: !disabled,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none focus:outline-none min-w-0 flex-1",
      },
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }
    const ext = editor.extensionManager.extensions.find(
      (e) => e.name === "markdown"
    ) as { storage?: { getMarkdown?: () => string } } | undefined;
    const getMd = () => {
      const m = (
        editor as { markdown?: { serialize: (doc: unknown) => string } }
      ).markdown;
      if (m) {
        return m.serialize(editor.state.doc.toJSON());
      }
      return ext?.storage?.getMarkdown?.() ?? "";
    };
    const off = editor.on("update", () => {
      const md = getMd();
      if (md) {
        onChangeRef.current(md);
      }
    });
    return () => off();
  }, [editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }
    const target = value ?? "";
    const currentMd = (
      editor as { markdown?: { serialize: (d: unknown) => string } }
    ).markdown?.serialize(editor.state.doc.toJSON());
    if (currentMd !== target) {
      editor.commands.setContent(target || "", false, {
        contentType: "markdown",
      } as { contentType: string });
    }
  }, [editor, value]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [disabled, editor]);

  if (!editor) {
    return (
      <div
        className={`rounded-md border border-input bg-background px-3 py-2 ${className ?? ""}`}
        style={{ minHeight }}
      >
        <span className="text-muted-foreground text-sm">{placeholder}</span>
      </div>
    );
  }

  return (
    <div
      className={`rounded-md border border-input bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ${className ?? ""}`}
      style={{ minHeight }}
    >
      <EditorContent editor={editor} />
    </div>
  );
}
