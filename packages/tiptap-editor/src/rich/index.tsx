/**
 * TipTap Rich Editor — Extends the base editor with KB-specific features.
 *
 * Adds: tables, images, highlight, task lists, code blocks with syntax
 * highlighting, callout blocks, slash commands, and a toolbar component.
 */

import type { Editor, Extensions, JSONContent } from "@tiptap/core";
import { useEditor } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { getEditorMarkdown } from "../base/index.jsx";
import type { SlashCommandItem } from "../extensions/slash-commands.js";
import {
  buildEditorPropsForLinkClicks,
  type RichEditorLinkClickHandler,
} from "./editor-link-click.js";
import type { InlineBubbleMenuOptions } from "./inline-bubble-types.js";
import { markdownToJson } from "./markdown-to-json.js";
import {
  type BlockMenuLabels,
  RichEditorContent,
  type RichEditorContentProps,
} from "./rich-editor-content.jsx";
import { getRichExtensions } from "./rich-extensions.js";

/* ── Types ── */

export interface RichEditorProps {
  autoFocus?: boolean;
  /** i18n / overrides for the block ⋮ menu */
  blockMenuLabels?: Partial<BlockMenuLabels>;
  className?: string;
  content?: JSONContent | null;
  editable?: boolean;
  /** Class merged onto the ProseMirror surface (passed to `RichEditorContent`). */
  editorContentClassName?: string;
  extensions?: Extensions;
  /**
   * Selection bubble (bold, italic, link, …). Default `true` when `editable`.
   * Pass `false` to hide, or an object to register `linkSources` / `customItems`.
   */
  inlineBubbleMenu?: boolean | InlineBubbleMenuOptions;
  /**
   * Markdown source for editable documents. When set, initial content and
   * external updates are driven by markdown (persisted round-trip). Omit when
   * using `content` with JSON instead.
   */
  markdown?: string;
  onChange?: (json: JSONContent, markdown: string) => void;
  /**
   * When set, link clicks inside the document can be handled client-side (e.g. SPA
   * `navigate`). Return true after handling to call `preventDefault` on the event.
   */
  onLinkClick?: RichEditorLinkClickHandler;
  placeholder?: string;
  /** Notion-style + / drag handle / block menu (editable only) */
  showBlockChrome?: boolean;
  /** Show the formatting toolbar */
  showToolbar?: boolean;
  /** Slash `/` menu items, or `false` to disable. Read-only editors default to `false`. */
  slashCommands?: SlashCommandItem[] | false;
}

/* ── Toolbar ── */

function EditorToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) {
    return null;
  }

  const btn = (label: string, action: () => void, isActive?: boolean) => (
    <button
      className={`tiptap-toolbar-btn ${isActive ? "is-active" : ""}`}
      onClick={action}
      title={label}
      type="button"
    >
      {label}
    </button>
  );

  return (
    <div className="tiptap-toolbar">
      {btn(
        "B",
        () => editor.chain().focus().toggleBold().run(),
        editor.isActive("bold")
      )}
      {btn(
        "I",
        () => editor.chain().focus().toggleItalic().run(),
        editor.isActive("italic")
      )}
      {btn(
        "U",
        () => editor.chain().focus().toggleUnderline().run(),
        editor.isActive("underline")
      )}
      {btn(
        "S",
        () => editor.chain().focus().toggleStrike().run(),
        editor.isActive("strike")
      )}
      <span className="tiptap-toolbar-sep" />
      {btn(
        "H1",
        () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
        editor.isActive("heading", { level: 1 })
      )}
      {btn(
        "H2",
        () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        editor.isActive("heading", { level: 2 })
      )}
      {btn(
        "H3",
        () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
        editor.isActive("heading", { level: 3 })
      )}
      <span className="tiptap-toolbar-sep" />
      {btn(
        "•",
        () => editor.chain().focus().toggleBulletList().run(),
        editor.isActive("bulletList")
      )}
      {btn(
        "1.",
        () => editor.chain().focus().toggleOrderedList().run(),
        editor.isActive("orderedList")
      )}
      {btn(
        "☑",
        () => editor.chain().focus().toggleTaskList().run(),
        editor.isActive("taskList")
      )}
      <span className="tiptap-toolbar-sep" />
      {btn(
        "❝",
        () => editor.chain().focus().toggleBlockquote().run(),
        editor.isActive("blockquote")
      )}
      {btn("—", () => editor.chain().focus().setHorizontalRule().run())}
      {btn(
        "💡",
        () => editor.chain().focus().toggleCallout({ type: "info" }).run(),
        editor.isActive("callout")
      )}
      <span className="tiptap-toolbar-sep" />
      {btn("⊞", () =>
        editor
          .chain()
          .focus()
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run()
      )}
      {btn("🖼", () => {
        // biome-ignore lint/suspicious/noAlert: intentional prompt for quick image URL input — replace with dialog later
        const url = globalThis.prompt?.("Image URL:");
        if (url) {
          editor.chain().focus().setImage({ src: url }).run();
        }
      })}
    </div>
  );
}

/* ── Component ── */

export function RichEditor(props: RichEditorProps) {
  const {
    content,
    markdown,
    placeholder,
    editable = true,
    onChange,
    extensions: extraExtensions,
    className,
    autoFocus,
    showToolbar = true,
    showBlockChrome = true,
    blockMenuLabels,
    editorContentClassName,
    slashCommands: slashCommandsProp,
    inlineBubbleMenu: inlineBubbleMenuProp,
    onLinkClick,
  } = props;

  const lastMarkdownFromEditorRef = useRef<string | undefined>(undefined);

  const slashCommands =
    slashCommandsProp === undefined
      ? editable
        ? undefined
        : false
      : slashCommandsProp;

  const inlineBubbleMenuResolved =
    inlineBubbleMenuProp === undefined ? !!editable : inlineBubbleMenuProp;

  const linkEditorProps = useMemo(
    () => buildEditorPropsForLinkClicks(onLinkClick),
    [onLinkClick]
  );

  const initialContent =
    markdown === undefined ? (content ?? undefined) : markdownToJson(markdown);

  const editor = useEditor({
    extensions: [
      ...getRichExtensions({ placeholder, slashCommands }),
      ...(extraExtensions ?? []),
    ],
    content: initialContent,
    editable,
    autofocus: autoFocus ? "end" : false,
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor: e }) => {
      const md = getEditorMarkdown(e);
      lastMarkdownFromEditorRef.current = md;
      if (onChange) {
        const json = e.getJSON();
        onChange(json, md);
      }
    },
    ...(linkEditorProps ? { editorProps: linkEditorProps } : {}),
  });

  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  useEffect(() => {
    if (!(editor && linkEditorProps)) {
      return;
    }
    editor.setOptions({ editorProps: linkEditorProps });
  }, [editor, linkEditorProps]);

  /** Read-only: `useEditor` only applies `content` on mount; sync when the prop changes (e.g. client nav between records). */
  useEffect(() => {
    if (!editor || editable) {
      return;
    }
    if (content === undefined) {
      return;
    }
    if (content === null) {
      editor.commands.clearContent();
      return;
    }
    const incoming = JSON.stringify(content);
    const current = JSON.stringify(editor.getJSON());
    if (incoming === current) {
      return;
    }
    editor.commands.setContent(content, { emitUpdate: false });
  }, [editor, editable, content]);

  /**
   * Editable markdown: sync when the parent replaces the body (reset, save,
   * file switch) without echoing every keystroke (parent value matches last
   * editor emission).
   */
  useEffect(() => {
    if (!(editor && editable) || markdown === undefined) {
      return;
    }
    if (markdown === lastMarkdownFromEditorRef.current) {
      return;
    }
    editor.commands.setContent(markdownToJson(markdown), { emitUpdate: false });
    lastMarkdownFromEditorRef.current = markdown;
  }, [editor, editable, markdown]);

  return (
    <div className={`tiptap-rich-editor ${className ?? ""}`}>
      {showToolbar && <EditorToolbar editor={editor} />}
      <RichEditorContent
        blockMenuLabels={blockMenuLabels}
        editor={editor}
        editorContentClassName={editorContentClassName}
        inlineBubbleMenu={inlineBubbleMenuResolved}
        showBlockChrome={showBlockChrome}
      />
    </div>
  );
}

/* ── Hook ── */

export function useRichEditor(
  props: Omit<RichEditorProps, "className" | "showToolbar">
) {
  const {
    content,
    markdown,
    placeholder,
    editable = true,
    onChange,
    extensions: extraExtensions,
    autoFocus,
    showBlockChrome = true,
    blockMenuLabels,
    editorContentClassName,
    slashCommands: slashCommandsProp,
    inlineBubbleMenu: inlineBubbleMenuProp,
    onLinkClick,
  } = props;

  const lastMarkdownFromEditorRef = useRef<string | undefined>(undefined);

  const slashCommands =
    slashCommandsProp === undefined
      ? editable
        ? undefined
        : false
      : slashCommandsProp;

  const inlineBubbleMenuResolved =
    inlineBubbleMenuProp === undefined ? !!editable : inlineBubbleMenuProp;

  const linkEditorProps = useMemo(
    () => buildEditorPropsForLinkClicks(onLinkClick),
    [onLinkClick]
  );

  const initialContent =
    markdown === undefined ? (content ?? undefined) : markdownToJson(markdown);

  const editor = useEditor({
    extensions: [
      ...getRichExtensions({ placeholder, slashCommands }),
      ...(extraExtensions ?? []),
    ],
    content: initialContent,
    editable,
    autofocus: autoFocus ? "end" : false,
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor: e }) => {
      const md = getEditorMarkdown(e);
      lastMarkdownFromEditorRef.current = md;
      if (onChange) {
        const json = e.getJSON();
        onChange(json, md);
      }
    },
    ...(linkEditorProps ? { editorProps: linkEditorProps } : {}),
  });

  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  useEffect(() => {
    if (!(editor && linkEditorProps)) {
      return;
    }
    editor.setOptions({ editorProps: linkEditorProps });
  }, [editor, linkEditorProps]);

  /** Read-only JSON sync (same behavior as `RichEditor`). */
  useEffect(() => {
    if (!editor || editable) {
      return;
    }
    if (content === undefined) {
      return;
    }
    if (content === null) {
      editor.commands.clearContent();
      return;
    }
    const incoming = JSON.stringify(content);
    const current = JSON.stringify(editor.getJSON());
    if (incoming === current) {
      return;
    }
    editor.commands.setContent(content, { emitUpdate: false });
  }, [editor, editable, content]);

  /** Editable markdown sync (same behavior as `RichEditor`). */
  useEffect(() => {
    if (!(editor && editable) || markdown === undefined) {
      return;
    }
    if (markdown === lastMarkdownFromEditorRef.current) {
      return;
    }
    editor.commands.setContent(markdownToJson(markdown), { emitUpdate: false });
    lastMarkdownFromEditorRef.current = markdown;
  }, [editor, editable, markdown]);

  const getJSON = useCallback(() => editor?.getJSON(), [editor]);
  const getMarkdown = useCallback(() => getEditorMarkdown(editor), [editor]);
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
    /** Defaults captured by the hook — pass `<RichEditorContent editor={editor} {...editorContentProps} />` */
    editorContentProps: {
      showBlockChrome,
      blockMenuLabels,
      editorContentClassName,
      inlineBubbleMenu: inlineBubbleMenuResolved,
    } as Pick<
      RichEditorContentProps,
      | "blockMenuLabels"
      | "editorContentClassName"
      | "inlineBubbleMenu"
      | "showBlockChrome"
    >,
    EditorToolbar: () => <EditorToolbar editor={editor} />,
  };
}

export {
  buildEditorPropsForLinkClicks,
  type RichEditorLinkClickHandler,
} from "./editor-link-click.js";
export {
  RichInlineBubbleMenu,
  type RichInlineBubbleMenuProps,
} from "./inline-bubble-menu.jsx";
export type {
  InlineBubbleMenuCustomItem,
  InlineBubbleMenuLabels,
  InlineBubbleMenuOptions,
  LinkSearchHit,
  LinkSearchSource,
} from "./inline-bubble-types.js";
export { markdownToJson } from "./markdown-to-json.js";
export type { BlockMenuLabels } from "./rich-editor-content.jsx";
export {
  RichEditorContent,
  type RichEditorContentProps,
} from "./rich-editor-content.jsx";
export {
  getRichContentExtensions,
  getRichExtensions,
} from "./rich-extensions.js";
export {
  SlashCommandList,
  type SlashCommandListProps,
  type SlashCommandListRef,
} from "./slash-command-list.jsx";
export { createSlashSuggestionRenderer } from "./slash-command-renderer.jsx";
export { EditorToolbar };
