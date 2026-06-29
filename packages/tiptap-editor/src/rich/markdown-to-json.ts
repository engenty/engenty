/**
 * Parse markdown into TipTap JSON using the same rich schema as the editor (no slash plugin).
 */

import { Editor, type JSONContent } from "@tiptap/core";
import { getRichContentExtensions } from "./rich-extensions.js";

export function markdownToJson(markdown: string): JSONContent {
  const editor = new Editor({
    element: null,
    extensions: getRichContentExtensions(),
  });

  try {
    editor.commands.setContent(markdown, {
      contentType: "markdown",
      emitUpdate: false,
    });
    return editor.getJSON();
  } finally {
    editor.destroy();
  }
}
