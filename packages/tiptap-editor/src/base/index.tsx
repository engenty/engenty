/**
 * TipTap Base Editor — Reusable core editor with essential formatting.
 *
 * Provides: headings, bold, italic, strike, code, blockquote, bullet/ordered lists,
 * horizontal rule, hard break, links, code blocks, typography, and markdown I/O.
 *
 * This base layer can be extended by `@engenty/tiptap-editor/rich` or
 * consumed directly by simpler editors (e.g. commercial-editor).
 */

import {
  type Editor,
  type Extensions,
  type JSONContent,
  Editor as TiptapEditor,
} from "@tiptap/core";
import Typography from "@tiptap/extension-typography";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect } from "react";

/* ── Types ── */

export interface BaseEditorProps {
  /** Auto-focus on mount */
  autoFocus?: boolean;
  /** CSS class for the editor wrapper */
  className?: string;
  /** Initial content as TipTap JSON */
  content?: JSONContent | null;
  /** Whether the editor is read-only */
  editable?: boolean;
  /** Additional TipTap extensions to merge */
  extensions?: Extensions;
  /** Called on every content change */
  onChange?: (json: JSONContent, markdown: string) => void;
  /** Placeholder text */
  placeholder?: string;
}

export interface BaseEditorRef {
  editor: Editor | null;
  focus: () => void;
  getJSON: () => JSONContent | undefined;
  getMarkdown: () => string;
  setContent: (content: JSONContent) => void;
}

/* ── Base extensions ── */

export function getBaseExtensions(opts?: { placeholder?: string }): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      codeBlock: false, // We'll use lowlight-powered code blocks in rich layer
      link: {
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { class: "tiptap-link" },
      },
    }),
    Placeholder.configure({
      placeholder: opts?.placeholder ?? "Start writing…",
      showOnlyCurrent: true,
      includeChildren: true,
    }),
    // GFM tables, strikethrough, etc. Inline HTML in markdown is passed through by marked by default.
    Markdown.configure({
      markedOptions: { gfm: true },
    }),
    Typography,
  ];
}

type MarkdownCapableEditor = Editor & {
  getMarkdown?: () => string;
  markdown?: { serialize: (doc: JSONContent) => string };
};

function getEditorMarkdown(editor: MarkdownCapableEditor | null | undefined) {
  if (!editor) {
    return "";
  }

  if (typeof editor.getMarkdown === "function") {
    return editor.getMarkdown();
  }

  return editor.markdown?.serialize(editor.state.doc.toJSON()) ?? "";
}

/* ── Markdown serialization ── */

function jsonToMarkdown(json: JSONContent): string {
  const editor = new TiptapEditor({
    element: null,
    content: json,
    extensions: getBaseExtensions(),
  });

  try {
    return getEditorMarkdown(editor);
  } finally {
    editor.destroy();
  }
}

/* ── Component ── */

export function BaseEditor(props: BaseEditorProps) {
  const {
    content,
    placeholder,
    editable = true,
    onChange,
    extensions: extraExtensions,
    className,
    autoFocus,
  } = props;

  const editor = useEditor({
    extensions: [
      ...getBaseExtensions({ placeholder }),
      ...(extraExtensions ?? []),
    ],
    content: content ?? undefined,
    editable,
    autofocus: autoFocus ? "end" : false,
    onUpdate: ({ editor: e }) => {
      if (onChange) {
        const json = e.getJSON();
        const md = getEditorMarkdown(e as MarkdownCapableEditor);
        onChange(json, md);
      }
    },
  });

  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  return (
    <div className={`tiptap-base-editor ${className ?? ""}`}>
      <EditorContent editor={editor} />
    </div>
  );
}

/* ── Hook for programmatic access ── */

export function useBaseEditor(props: Omit<BaseEditorProps, "className">) {
  const {
    content,
    placeholder,
    editable = true,
    onChange,
    extensions: extraExtensions,
    autoFocus,
  } = props;

  const editor = useEditor({
    extensions: [
      ...getBaseExtensions({ placeholder }),
      ...(extraExtensions ?? []),
    ],
    content: content ?? undefined,
    editable,
    autofocus: autoFocus ? "end" : false,
    onUpdate: ({ editor: e }) => {
      if (onChange) {
        const json = e.getJSON();
        const md = getEditorMarkdown(e as MarkdownCapableEditor);
        onChange(json, md);
      }
    },
  });

  const getJSON = useCallback(() => editor?.getJSON(), [editor]);
  const getMarkdown = useCallback(
    () => getEditorMarkdown(editor as MarkdownCapableEditor | undefined),
    [editor]
  );
  const setContent = useCallback(
    (c: JSONContent) =>
      editor?.commands.setContent(c, {
        emitUpdate: false,
      }),
    [editor]
  );
  const focus = useCallback(() => editor?.commands.focus(), [editor]);

  return {
    editor,
    getJSON,
    getMarkdown,
    setContent,
    focus,
  };
}

export type { Editor, Extensions, JSONContent } from "@tiptap/core";
export { getEditorMarkdown, jsonToMarkdown };
