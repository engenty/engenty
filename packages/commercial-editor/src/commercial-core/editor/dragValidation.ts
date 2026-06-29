/** Minimal block shape for drag validation - compatible with offer and invoice blocks */
interface EditorBlock {
  content: any;
  id: string;
  type: string;
}

function isLineItem(block: EditorBlock): boolean {
  return block.type === "line_item";
}

function isGroupParent(blocks: EditorBlock[], block: EditorBlock): boolean {
  if (!isLineItem(block)) {
    return false;
  }
  return blocks.some((b) => isLineItem(b) && b.content?.parent_id === block.id);
}

/**
 * Check if dropping the active (dragged) block onto the over block would be valid.
 * Used to show danger styling when hovering over invalid drop targets during drag.
 * Shared by offer and invoice editors.
 */
export function isValidLineItemDrop(
  blocks: EditorBlock[],
  activeId: string,
  overId: string
): boolean {
  if (!overId || activeId === overId) {
    return true;
  }

  const oldIdx = blocks.findIndex((b) => b.id === activeId);
  const newIdx = blocks.findIndex((b) => b.id === overId);
  if (oldIdx === -1 || newIdx === -1) {
    return true;
  }

  const dragged = blocks[oldIdx];
  const over = blocks[newIdx];

  if (!isLineItem(dragged)) {
    return true;
  }

  const draggedParentId = dragged.content?.parent_id;

  if (draggedParentId) {
    const parentIdx = blocks.findIndex((b) => b.id === draggedParentId);
    if (parentIdx === -1) {
      return false;
    }
    const siblingIndices = blocks
      .map((b, i) => ({ b, i }))
      .filter(
        ({ b }) => isLineItem(b) && b.content?.parent_id === draggedParentId
      )
      .map(({ i }) => i);
    const minIdx = parentIdx + 1;
    const maxIdx =
      siblingIndices.length > 0 ? Math.max(...siblingIndices) : minIdx;
    return newIdx >= minIdx && newIdx <= maxIdx;
  }

  if (isGroupParent(blocks, dragged)) {
    return !over.content?.parent_id;
  }

  return true;
}
