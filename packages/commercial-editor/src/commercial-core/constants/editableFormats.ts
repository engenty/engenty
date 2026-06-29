/** Prose list tweaks for document intro/final notes preview (indent via RichTextEditor.css). */
export const PROSE_LIST_CLASS = "prose-li:my-0.5";

/** Allowed formats for document intro/final notes rich text. */
export const DOCUMENT_EDITABLE_FORMATS = {
  bold: true,
  italic: true,
  underline: true,
  strikethrough: true,
  headings: false,
  lists: true,
  links: true,
} as const;
