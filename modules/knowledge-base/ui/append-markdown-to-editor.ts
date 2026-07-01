import type { Editor, JSONContent } from "@engenty/tiptap-editor";
import { markdownToJson } from "@engenty/tiptap-editor";

function plainParagraphBlocks(text: string): JSONContent[] {
  return text
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line) => ({
      type: "paragraph" as const,
      content: [{ type: "text" as const, text: line }],
    }));
}

/** Appends blocks at document end; never inserts a nested `doc` node. */
function insertBlocksAtDocEnd(editor: Editor, blocks: JSONContent[]): boolean {
  if (blocks.length === 0) {
    return false;
  }
  const pos = editor.state.doc.content.size;
  try {
    return editor.chain().focus().insertContentAt(pos, blocks).run();
  } catch {
    return false;
  }
}

/**
 * Appends markdown at the end of the document; never replaces existing content.
 *
 * TipTap's `insertContent(…, { contentType: "markdown" })` parses to a full
 * `doc` JSON node; inserting that via `insertContentAt` can fail (nested doc).
 * We parse with the same schema as the editor (`markdownToJson`) and insert
 * only the inner block array.
 */
export function appendMarkdownAtEnd(
  editor: Editor | null,
  md: string
): boolean {
  if (!(editor && md.trim())) {
    return false;
  }
  const body = md.trim();
  const hasExisting = Boolean(editor.getText().trim());
  const separator = hasExisting ? "\n\n" : "";
  const toInsert = `${separator}${body}`;

  try {
    const parsed = markdownToJson(toInsert);
    if (
      parsed.type === "doc" &&
      Array.isArray(parsed.content) &&
      insertBlocksAtDocEnd(editor, parsed.content)
    ) {
      return true;
    }
  } catch {
    // fall through
  }

  return insertBlocksAtDocEnd(editor, plainParagraphBlocks(toInsert));
}

/** Whether the editor has no visible text (empty paragraph counts as empty). */
export function isEditorTextEmpty(editor: Editor | null): boolean {
  if (!editor) {
    return true;
  }
  return !editor.getText().trim();
}
