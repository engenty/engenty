import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { TransformId } from "./block-menu-labels.js";
import type { BlockRange } from "./block-utils.js";

function replaceBlockWith(
  editor: Editor,
  block: BlockRange,
  createNode: () => PMNode | null
): boolean {
  const next = createNode();
  if (!next) {
    return false;
  }
  return editor
    .chain()
    .focus()
    .command(({ tr }) => {
      tr.replaceWith(block.from, block.to, next);
      return true;
    })
    .run();
}

export function transformBlock(
  editor: Editor,
  block: BlockRange,
  id: TransformId
) {
  const { schema } = editor;
  const { node } = block;
  const content = node.content;

  switch (id) {
    case "paragraph": {
      const p = schema.nodes.paragraph?.create(null, content, node.marks);
      if (!p) {
        return false;
      }
      return replaceBlockWith(editor, block, () => p);
    }
    case "heading1":
    case "heading2":
    case "heading3": {
      const level = Number(id.replace("heading", "")) as 1 | 2 | 3;
      const h = schema.nodes.heading?.create({ level }, content, node.marks);
      if (!h) {
        return false;
      }
      return replaceBlockWith(editor, block, () => h);
    }
    case "bulletList": {
      const p = schema.nodes.paragraph?.create(null, content, node.marks);
      const li = schema.nodes.listItem?.create(null, p ?? undefined);
      const ul = schema.nodes.bulletList?.create(null, li ?? undefined);
      if (!ul) {
        return false;
      }
      return replaceBlockWith(editor, block, () => ul);
    }
    case "orderedList": {
      const p = schema.nodes.paragraph?.create(null, content, node.marks);
      const li = schema.nodes.listItem?.create(null, p ?? undefined);
      const ol = schema.nodes.orderedList?.create(null, li ?? undefined);
      if (!ol) {
        return false;
      }
      return replaceBlockWith(editor, block, () => ol);
    }
    case "blockquote": {
      const p = schema.nodes.paragraph?.create(null, content, node.marks);
      const bq = schema.nodes.blockquote?.create(null, p ?? undefined);
      if (!bq) {
        return false;
      }
      return replaceBlockWith(editor, block, () => bq);
    }
    default:
      return false;
  }
}

export function duplicateBlock(editor: Editor, block: BlockRange) {
  const slice = editor.state.doc.slice(block.from, block.to);
  editor.view.dispatch(editor.state.tr.insert(block.to, slice.content));
}

export function deleteBlock(editor: Editor, block: BlockRange) {
  editor.chain().focus().deleteRange({ from: block.from, to: block.to }).run();
}
