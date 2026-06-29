/**
 * TipTap Slash Commands Extension.
 *
 * Provides a `/` menu for inserting content blocks, similar to Notion.
 * Uses @tiptap/suggestion for the popup positioning and filtering.
 */

import { type Editor, Extension, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";

/* ── Command items ── */

export interface SlashCommandItem {
  description: string;
  icon: string;
  keywords?: string[];
  onSelect: (editor: Editor) => void;
  title: string;
}

export const defaultSlashCommands: SlashCommandItem[] = [
  {
    title: "Text",
    description: "Plain paragraph text",
    icon: "¶",
    keywords: ["paragraph", "text", "plain"],
    onSelect: (editor) => editor.chain().focus().clearNodes().run(),
  },
  {
    title: "Heading 1",
    description: "Large section heading",
    icon: "H1",
    keywords: ["h1", "heading", "title", "large"],
    onSelect: (editor) =>
      editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    title: "Heading 2",
    description: "Medium section heading",
    icon: "H2",
    keywords: ["h2", "heading", "subtitle"],
    onSelect: (editor) =>
      editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    title: "Heading 3",
    description: "Small section heading",
    icon: "H3",
    keywords: ["h3", "heading", "small"],
    onSelect: (editor) =>
      editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    title: "Bullet List",
    description: "Unordered list with bullets",
    icon: "•",
    keywords: ["ul", "unordered", "bullet", "list"],
    onSelect: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    title: "Numbered List",
    description: "Ordered list with numbers",
    icon: "1.",
    keywords: ["ol", "ordered", "number", "list"],
    onSelect: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    title: "Task List",
    description: "Checklist with checkboxes",
    icon: "☑",
    keywords: ["todo", "task", "check", "checkbox"],
    onSelect: (editor) => editor.chain().focus().toggleTaskList().run(),
  },
  {
    title: "Quote",
    description: "Block quotation",
    icon: "❝",
    keywords: ["blockquote", "quote", "citation"],
    onSelect: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    title: "Code Block",
    description: "Syntax-highlighted code",
    icon: "<>",
    keywords: ["code", "pre", "codeblock", "syntax"],
    onSelect: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    title: "Divider",
    description: "Horizontal rule separator",
    icon: "—",
    keywords: ["hr", "divider", "rule", "line", "separator"],
    onSelect: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  {
    title: "Callout",
    description: "Highlighted information block",
    icon: "💡",
    keywords: ["callout", "info", "note", "tip", "warning"],
    onSelect: (editor) =>
      editor.chain().focus().toggleCallout({ type: "info" }).run(),
  },
  {
    title: "Table",
    description: "Insert a 3×3 table",
    icon: "⊞",
    keywords: ["table", "grid", "rows", "columns"],
    onSelect: (editor) =>
      editor
        .chain()
        .focus()
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    title: "Image",
    description: "Embed an image from URL",
    icon: "🖼",
    keywords: ["image", "picture", "photo", "img"],
    onSelect: (editor) => {
      // biome-ignore lint/suspicious/noAlert: intentional prompt for quick image URL — replace with dialog later
      const url = globalThis.prompt?.("Image URL:");
      if (url) {
        editor.chain().focus().setImage({ src: url }).run();
      }
    },
  },
  {
    title: "HTML block",
    description: "Embed raw HTML (trusted content only)",
    icon: "⟨⟩",
    keywords: ["html", "embed", "iframe", "snippet"],
    onSelect: (editor) => {
      // biome-ignore lint/suspicious/noAlert: intentional prompt — replace with dialog later
      const html = globalThis.prompt?.("HTML snippet:");
      if (html?.trim()) {
        editor
          .chain()
          .focus()
          .insertContent({
            type: "rawHtml",
            attrs: { html: html.trim() },
          })
          .run();
      }
    },
  },
];

/* ── Extension ── */

export const slashPluginKey = new PluginKey("slash-commands");

export interface SlashCommandsOptions {
  commands?: SlashCommandItem[];
  suggestion?: Partial<SuggestionOptions>;
}

export const SlashCommands = Extension.create<SlashCommandsOptions>({
  name: "slashCommands",

  addOptions() {
    return {
      commands: defaultSlashCommands,
      suggestion: {},
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: "/",
        pluginKey: slashPluginKey,
        command: ({
          editor,
          range,
          props,
        }: {
          editor: Editor;
          range: Range;
          props: SlashCommandItem;
        }) => {
          editor.chain().focus().deleteRange(range).run();
          props.onSelect(editor);
        },
        items: ({ query }: { query: string }) => {
          const commands = this.options.commands ?? defaultSlashCommands;
          if (!query) {
            return commands;
          }
          const q = query.toLowerCase();
          return commands.filter(
            (item) =>
              item.title.toLowerCase().includes(q) ||
              item.description.toLowerCase().includes(q) ||
              item.keywords?.some((k) => k.includes(q))
          );
        },
        ...this.options.suggestion,
      }),
    ];
  },
});
