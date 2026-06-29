import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";

export interface BlockRange {
  from: number;
  node: PMNode;
  to: number;
}

/** Resolve the innermost block node (group "block") at `pos`. */
export function resolveBlockAtPos(doc: PMNode, pos: number): BlockRange | null {
  if (doc.content.size <= 0) {
    return null;
  }
  const clamped = Math.max(1, Math.min(pos, doc.content.size));
  const $pos = doc.resolve(clamped);
  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d);
    const group = node.type.spec.group;
    if (group?.split(/\s+/).includes("block") && node.type.name !== "doc") {
      return { from: $pos.before(d), to: $pos.after(d), node };
    }
  }
  return null;
}

export const BLOCK_DRAG_MIME = "application/x-engenty-block";

export function moveBlockSlice(
  editor: Editor,
  from: number,
  to: number,
  insertPos: number
): boolean {
  const { state, dispatch } = editor.view;
  if (insertPos >= from && insertPos <= to) {
    return false;
  }
  const slice = state.doc.slice(from, to);
  const tr = state.tr;
  tr.delete(from, to);
  const mapped = tr.mapping.map(insertPos);
  tr.insert(mapped, slice.content);
  dispatch(tr);
  return true;
}
