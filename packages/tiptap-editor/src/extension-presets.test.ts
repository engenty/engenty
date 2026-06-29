import { Editor, type Extensions } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { getBaseExtensions, jsonToMarkdown } from "./base/index.js";
import { getRichExtensions } from "./rich/index.js";

const editors: Editor[] = [];

function createEditor(extensions: Extensions) {
  const editor = new Editor({
    element: null,
    content: {
      type: "doc",
      content: [{ type: "paragraph" }],
    },
    extensions,
  });

  editors.push(editor);

  return editor;
}

afterEach(() => {
  for (const editor of editors.splice(0)) {
    editor.destroy();
  }
});

describe("editor extension presets", () => {
  it("registers link, underline, and placeholder once in the base preset", () => {
    const editor = createEditor(
      getBaseExtensions({ placeholder: "Start writing" })
    );
    const names = editor.extensionManager.extensions.map(
      (extension) => extension.name
    );

    expect(names.filter((name) => name === "link")).toHaveLength(1);
    expect(names.filter((name) => name === "underline")).toHaveLength(1);
    expect(names.filter((name) => name === "placeholder")).toHaveLength(1);
  });

  it("serializes content through the markdown extension", () => {
    const markdown = jsonToMarkdown({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Hello" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "World" },
            { type: "text", text: "!" },
          ],
        },
      ],
    });

    expect(markdown).toContain("## Hello");
    expect(markdown).toContain("World!");
  });

  it("includes rich extensions from the v3 table and list packages", () => {
    const editor = createEditor(
      getRichExtensions({ placeholder: "Write something" })
    );
    const names = editor.extensionManager.extensions.map(
      (extension) => extension.name
    );

    expect(names).toContain("table");
    expect(names).toContain("tableRow");
    expect(names).toContain("tableCell");
    expect(names).toContain("tableHeader");
    expect(names).toContain("taskList");
    expect(names).toContain("taskItem");
    expect(names).toContain("codeBlock");
    expect(names).toContain("callout");
    expect(names).toContain("rawHtml");
    expect(names).toContain("slashCommands");
  });

  it("omits slash commands when slashCommands is false", () => {
    const editor = createEditor(
      getRichExtensions({ slashCommands: false, placeholder: "x" })
    );
    const names = editor.extensionManager.extensions.map((e) => e.name);
    expect(names).not.toContain("slashCommands");
  });
});
