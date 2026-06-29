import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useRef, useState } from "react";

import {
  addBlockAt,
  addGroupAt,
  addLineItemAt,
  addSubItemToParent,
  recalculateCommercialIndex,
} from "./commercial-block-operations";
import type { LineItemSubtype } from "./commercial-core/constants/blockDefaults";
import { isValidLineItemDrop } from "./commercial-core/editor/dragValidation";
import { computeCommercialPositions } from "./commercial-core/engine/positions";
import type { CommercialBlock } from "./types";

interface UseCommercialBlocksProps {
  blocks: CommercialBlock[];
  defaultTax?: number;
  onChange: (blocks: CommercialBlock[]) => void;
}

function isLineItem(block: CommercialBlock): boolean {
  return block.type === "line_item";
}

function getChildBlocks(
  blocks: CommercialBlock[],
  parentId: string
): CommercialBlock[] {
  return blocks.filter(
    (b) => isLineItem(b) && (b.content as any)?.parent_id === parentId
  );
}

function getChildIndices(
  blocks: CommercialBlock[],
  parentId: string
): number[] {
  return blocks
    .map((b, i) => ({ block: b, index: i }))
    .filter(
      ({ block }) =>
        isLineItem(block) && (block.content as any)?.parent_id === parentId
    )
    .map(({ index }) => index);
}

function isGroupParent(
  blocks: CommercialBlock[],
  block: CommercialBlock
): boolean {
  if (!isLineItem(block)) {
    return false;
  }
  return blocks.some(
    (b) => isLineItem(b) && (b.content as any)?.parent_id === block.id
  );
}

export const useCommercialBlocks = ({
  blocks,
  onChange,
  defaultTax = 20,
}: UseCommercialBlocksProps) => {
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const tempIdRef = useRef(0);

  const createTempId = () => {
    tempIdRef.current += 1;
    try {
      if (
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
      ) {
        return `temp-${crypto.randomUUID()}`;
      }
    } catch {
      // Ignore
    }
    return `temp-${Date.now()}-${tempIdRef.current}`;
  };

  const updateBlock = (index: number, content: any) => {
    const updated = [...blocks];
    updated[index] = { ...updated[index], content };
    onChange(updated);
  };

  const addBlockAbove = (index: number, type: string) => {
    const { blocks: next, newBlock } = addBlockAt(
      blocks,
      index,
      type,
      defaultTax,
      createTempId
    );
    onChange(next);
    return newBlock;
  };

  const addLineItemAbove = (index: number, subtype: LineItemSubtype) => {
    const { blocks: next, newBlock } = addLineItemAt(
      blocks,
      index,
      subtype,
      defaultTax,
      createTempId
    );
    onChange(next);
    return newBlock;
  };

  const addSubItem = (parentId: string) => {
    const mutation = addSubItemToParent(
      blocks,
      parentId,
      defaultTax,
      createTempId
    );
    if (!mutation) {
      return null;
    }
    onChange(mutation.blocks);
    return mutation.newBlock;
  };

  const addGroup = (index: number) => {
    const { blocks: next, newBlock } = addGroupAt(
      blocks,
      index,
      defaultTax,
      createTempId
    );
    onChange(next);
    return newBlock;
  };

  const promoteToTopLevel = (blockId: string) => {
    const blockIndex = blocks.findIndex((b) => b.id === blockId);
    if (blockIndex === -1) {
      return;
    }

    const block = blocks[blockIndex];
    if (!(block.content as any)?.parent_id) {
      return;
    }

    const updated = [...blocks];
    updated[blockIndex] = {
      ...block,
      content: { ...(block.content as any), parent_id: null },
    };
    onChange(
      computeCommercialPositions(
        updated.map((b, i) => ({ ...b, order_index: i })),
        { respectManualPositions: true }
      )
    );
  };

  const demoteToSubLevel = (blockId: string) => {
    const blockIndex = blocks.findIndex((b) => b.id === blockId);
    if (blockIndex === -1) {
      return;
    }

    const block = blocks[blockIndex];
    if (!isLineItem(block) || (block.content as any)?.parent_id) {
      return;
    }

    let prevItemIndex = -1;
    for (let i = blockIndex - 1; i >= 0; i--) {
      if (isLineItem(blocks[i])) {
        prevItemIndex = i;
        break;
      }
    }
    if (prevItemIndex === -1) {
      return;
    }

    const prevItem = blocks[prevItemIndex];
    const newParentId =
      (prevItem.content as any)?.parent_id == null
        ? prevItem.id
        : (prevItem.content as any).parent_id;

    const blockWithNewParent = {
      ...block,
      content: { ...(block.content as any), parent_id: newParentId },
    };

    const insertAfterIndex =
      newParentId === prevItem.id
        ? getChildIndices(blocks, newParentId).length > 0
          ? Math.max(...getChildIndices(blocks, newParentId))
          : prevItemIndex
        : prevItemIndex;

    const updated = [...blocks];
    updated.splice(blockIndex, 1);
    updated.splice(insertAfterIndex + 1, 0, blockWithNewParent);
    onChange(
      computeCommercialPositions(
        updated.map((b, i) => ({ ...b, order_index: i })),
        { respectManualPositions: true }
      )
    );
  };

  const deleteBlock = (index: number) => {
    const block = blocks[index];
    let updated = blocks.filter((_, i) => i !== index);

    if (isLineItem(block)) {
      updated = updated.filter(
        (b) => !(isLineItem(b) && (b.content as any)?.parent_id === block.id)
      );
    }

    const reindexed = updated.map((b, i) => ({ ...b, order_index: i }));
    onChange(
      computeCommercialPositions(reindexed, { respectManualPositions: true })
    );
  };

  const duplicateBlock = (index: number) => {
    const block = blocks[index];
    const newParentId = createTempId();

    const newBlock = {
      id: newParentId,
      type: block.type,
      content: {
        ...(block.content as any),
        parent_id: (block.content as any)?.parent_id ?? null,
      },
      order_index: index + 1,
    } as CommercialBlock;

    const newBlocks = [...blocks];
    newBlocks.splice(index + 1, 0, newBlock);

    if (isLineItem(block) && isGroupParent(blocks, block)) {
      const children = getChildBlocks(blocks, block.id);
      let insertOffset = 1;
      for (const child of children) {
        insertOffset++;
        const newChild = {
          id: createTempId(),
          type: child.type,
          content: { ...(child.content as any), parent_id: newParentId },
          order_index: index + insertOffset,
        } as CommercialBlock;
        newBlocks.splice(index + insertOffset, 0, newChild);
      }
    }

    const reindexed = newBlocks.map((b, i) => ({ ...b, order_index: i }));
    onChange(computeCommercialPositions(reindexed));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = blocks.findIndex((b) => b.id === active.id);
      const newIndex = blocks.findIndex((b) => b.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const draggedBlock = blocks[oldIndex];

        if (
          isLineItem(draggedBlock) &&
          !isValidLineItemDrop(
            blocks as any,
            String(active.id),
            String(over.id)
          )
        ) {
          return;
        }

        if (isLineItem(draggedBlock) && isGroupParent(blocks, draggedBlock)) {
          const childIndices = getChildIndices(blocks, draggedBlock.id);
          const allIndices = [oldIndex, ...childIndices].sort((a, b) => a - b);

          const movingBlocks = allIndices.map((i) => blocks[i]);
          const remaining = blocks.filter((_, i) => !allIndices.includes(i));

          let adjustedNewIndex = newIndex;
          for (const idx of allIndices) {
            if (idx < newIndex) {
              adjustedNewIndex--;
            }
          }
          adjustedNewIndex = Math.max(
            0,
            Math.min(adjustedNewIndex, remaining.length)
          );

          remaining.splice(adjustedNewIndex, 0, ...movingBlocks);

          const reindexed = remaining.map((b, i) => ({ ...b, order_index: i }));
          onChange(
            computeCommercialPositions(reindexed, {
              respectManualPositions: true,
            })
          );
          return;
        }

        const reordered = arrayMove(blocks, oldIndex, newIndex);
        const reindexed = reordered.map((b, i) => ({ ...b, order_index: i }));
        onChange(
          computeCommercialPositions(reindexed, {
            respectManualPositions: true,
          })
        );
      }
    }
  };

  const recalculateIndex = () => {
    onChange(recalculateCommercialIndex(blocks));
  };

  return {
    editingBlockId,
    setEditingBlockId,
    updateBlock,
    addBlockAbove,
    addLineItemAbove,
    addSubItem,
    addGroup,
    promoteToTopLevel,
    demoteToSubLevel,
    deleteBlock,
    duplicateBlock,
    handleDragEnd,
    recalculateIndex,
  };
};
