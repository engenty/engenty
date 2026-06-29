/**
 * @engenty/tiptap-editor — Public API.
 *
 * Re-exports both base and rich editor layers for convenience.
 */

// Re-export TipTap core types for consumers
export type { Editor, Extensions, JSONContent } from "@tiptap/core";
export { EditorContent } from "@tiptap/react";
// Base editor (reusable core)
export {
  BaseEditor,
  type BaseEditorProps,
  type BaseEditorRef,
  getBaseExtensions,
  jsonToMarkdown,
  useBaseEditor,
} from "./base/index.jsx";

// Extensions
export { CalloutExtension, type CalloutType } from "./extensions/callout.js";
export { RawHtmlExtension } from "./extensions/raw-html.js";
export {
  defaultSlashCommands,
  type SlashCommandItem,
  SlashCommands,
  type SlashCommandsOptions,
  slashPluginKey,
} from "./extensions/slash-commands.js";
// Inline editable (short briefs, intros)
export {
  InlineEditableRichText,
  type InlineEditableRichTextEmptyState,
  type InlineEditableRichTextProps,
} from "./inline-editable/index.jsx";
export type {
  InlineBubbleMenuCustomItem,
  InlineBubbleMenuLabels,
  InlineBubbleMenuOptions,
  LinkSearchHit,
  LinkSearchSource,
} from "./rich/index.jsx";
// Rich editor (KB features)
export {
  type BlockMenuLabels,
  createSlashSuggestionRenderer,
  EditorToolbar,
  getRichContentExtensions,
  getRichExtensions,
  markdownToJson,
  RichEditor,
  RichEditorContent,
  type RichEditorContentProps,
  type RichEditorLinkClickHandler,
  type RichEditorProps,
  RichInlineBubbleMenu,
  type RichInlineBubbleMenuProps,
  SlashCommandList,
  type SlashCommandListProps,
  type SlashCommandListRef,
  useRichEditor,
} from "./rich/index.jsx";
