import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { defaultSlashCommands } from "./extensions/slash-commands.js";
import { getRichContentExtensions } from "./rich/rich-extensions.js";

afterEach(() => {
  // no shared state
});

describe("SlashCommands behavior", () => {
  it("deleteRange then Heading 1 removes trigger text and activates heading", () => {
    const editor = new Editor({
      element: null,
      extensions: getRichContentExtensions(),
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "/h1" }],
          },
        ],
      },
    });

    try {
      const cmd = defaultSlashCommands.find((c) => c.title === "Heading 1");
      expect(cmd).toBeDefined();

      let from = 0;
      let to = 0;
      editor.state.doc.descendants((node, pos) => {
        if (node.isText && node.text) {
          from = pos;
          to = pos + node.text.length;
          return false;
        }
      });

      editor.chain().focus().deleteRange({ from, to }).run();
      cmd?.onSelect(editor);

      expect(editor.getText()).not.toContain("/h1");
      expect(editor.isActive("heading", { level: 1 })).toBe(true);
    } finally {
      editor.destroy();
    }
  });
});
