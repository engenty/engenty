import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useTranslation } from "@engenty/i18n/ui";
import { toast } from "@engenty/ui-core";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type { OfferBlock } from "../offerToTemplateData/types";

import {
  createGroupDefaults,
  createLineItemDefaults,
  getDefaultContent,
  getPhaseHeadlineDefaults,
  isPhaseHeadlineBlock,
  type LineItemSubtype,
} from "./constants/blockDefaults";
import { isValidLineItemDrop } from "./editor";
import { computeCommercialPositions } from "./engine/positions";

interface UseOfferBlocksProps {
  /** Default tax rate for new line items (from settings). Falls back to FALLBACK_TAX_RATE. */
  defaultTax?: number;
  initialBlocks?: OfferBlock[];
  offerId: string | undefined;
}

/**
 * Find the phase boundary containing a given block index.
 * Phase boundaries = next phase headline or end of document (no phase_end blocks).
 * Returns { start, end, phaseIndex } or null if not in a phase.
 */
function findPhaseBoundary(
  blocks: OfferBlock[],
  blockIndex: number
): { start: number; end: number; phaseIndex: number } | null {
  let currentPhaseStart = -1;
  let currentPhaseIndex = -1;

  for (let i = 0; i <= blockIndex; i++) {
    if (isPhaseHeadlineBlock(blocks[i])) {
      currentPhaseStart = i;
      currentPhaseIndex++;
    }
  }

  if (currentPhaseStart === -1) {
    return null;
  }

  // Phase ends at next phase headline or end of document
  let phaseEnd = blocks.length - 1;
  for (let i = currentPhaseStart + 1; i < blocks.length; i++) {
    if (isPhaseHeadlineBlock(blocks[i])) {
      phaseEnd = i - 1;
      break;
    }
  }

  return {
    start: currentPhaseStart,
    end: phaseEnd,
    phaseIndex: currentPhaseIndex,
  };
}

function _findPreviousPhaseStart(
  blocks: OfferBlock[],
  fromIndex: number
): number | null {
  for (let i = fromIndex; i >= 0; i -= 1) {
    if (isPhaseHeadlineBlock(blocks[i])) {
      return i;
    }
  }
  return null;
}

function _findNextPhaseStart(
  blocks: OfferBlock[],
  fromIndex: number
): number | null {
  for (let i = fromIndex; i < blocks.length; i += 1) {
    if (isPhaseHeadlineBlock(blocks[i])) {
      return i;
    }
  }
  return null;
}

/**
 * Check if a block is a line item type
 */
function isLineItem(block: OfferBlock): boolean {
  return block.type === "line_item";
}

/**
 * Get all children of a parent block (by parent_id in content)
 */
function getChildBlocks(blocks: OfferBlock[], parentId: string): OfferBlock[] {
  return blocks.filter(
    (b) => isLineItem(b) && b.content?.parent_id === parentId
  );
}

/**
 * Get child block indices for a parent
 */
function getChildIndices(blocks: OfferBlock[], parentId: string): number[] {
  return blocks
    .map((b, i) => ({ block: b, index: i }))
    .filter(
      ({ block }) => isLineItem(block) && block.content?.parent_id === parentId
    )
    .map(({ index }) => index);
}

/**
 * Check if a line_item is a group parent (has children)
 */
function isGroupParent(blocks: OfferBlock[], block: OfferBlock): boolean {
  if (!isLineItem(block)) {
    return false;
  }
  return blocks.some((b) => isLineItem(b) && b.content?.parent_id === block.id);
}

export const useOfferBlocks = ({
  offerId,
  initialBlocks = [],
  defaultTax,
}: UseOfferBlocksProps) => {
  const { t } = useTranslation("offers");
  const [blocks, setBlocks] = useState<OfferBlock[]>(initialBlocks);
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
      // Ignore and fall back to timestamp-based IDs
    }
    return `temp-${Date.now()}-${tempIdRef.current}`;
  };

  const updateBlock = (index: number, content: any) => {
    const updated = [...blocks];
    updated[index] = {
      ...updated[index],
      content,
    };
    setBlocks(updated);
  };

  const addBlock = (type: string): OfferBlock | null =>
    addBlockAbove(blocks.length, type);

  const addBlockAbove = (index: number, type: string): OfferBlock | null => {
    let insertIndex = index;

    if (type === "phase_start") {
      const boundary = findPhaseBoundary(blocks, insertIndex);
      if (boundary) {
        insertIndex = boundary.end + 1;
      }
    }

    const isPhase = type === "phase_start";
    const newBlock: OfferBlock = {
      id: createTempId(),
      type: isPhase ? "headline" : type,
      content: isPhase
        ? getPhaseHeadlineDefaults()
        : getDefaultContent(type, defaultTax),
      order_index: insertIndex,
    };

    setBlocks((prev) => {
      const newBlocks = [...prev];
      newBlocks.splice(insertIndex, 0, newBlock);
      const reindexed = newBlocks.map((b, i) => ({ ...b, order_index: i }));
      return computeCommercialPositions(reindexed);
    });
    toast.success(t("offers.blockAdded"));
    return newBlock;
  };

  /**
   * Add a line_item with specific subtype (position, headline, text, page_break) at index
   */
  const addLineItemAbove = (
    index: number,
    subtype: LineItemSubtype
  ): OfferBlock | null => {
    const newBlock: OfferBlock = {
      id: createTempId(),
      type: "line_item",
      content: createLineItemDefaults(subtype, defaultTax),
      order_index: index,
    };
    const newBlocks = [...blocks];
    newBlocks.splice(index, 0, newBlock);
    const reindexed = newBlocks.map((b, i) => ({ ...b, order_index: i }));
    setBlocks(
      computeCommercialPositions(reindexed, { respectManualPositions: true })
    );
    toast.success(t("offers.blockAdded"));
    return newBlock;
  };

  /**
   * Add a sub-item (child) to an existing line_item parent
   */
  const addSubItem = (parentId: string): OfferBlock | null => {
    const parentIndex = blocks.findIndex((b) => b.id === parentId);
    if (parentIndex === -1) {
      return null;
    }

    // Find the last child of this parent to insert after it
    const childIndices = getChildIndices(blocks, parentId);
    const insertAfter =
      childIndices.length > 0 ? Math.max(...childIndices) : parentIndex;

    const newBlock: OfferBlock = {
      id: createTempId(),
      type: "line_item",
      content: {
        ...createLineItemDefaults("position", defaultTax),
        parent_id: parentId,
      },
      order_index: insertAfter + 1,
    };

    const newBlocks = [...blocks];
    newBlocks.splice(insertAfter + 1, 0, newBlock);

    const reindexed = newBlocks.map((b, i) => ({ ...b, order_index: i }));
    setBlocks(
      computeCommercialPositions(reindexed, { respectManualPositions: true })
    );
    toast.success(t("offers.blockAdded"));
    return newBlock;
  };

  /**
   * Add a group: a text-only parent + one child line_item
   */
  const addGroup = (index: number): OfferBlock | null => {
    const parentId = createTempId();
    const defaults = createGroupDefaults(parentId, defaultTax);

    const parentBlock: OfferBlock = {
      id: parentId,
      type: "line_item",
      content: defaults.parent,
      order_index: index,
    };

    const childBlock: OfferBlock = {
      id: createTempId(),
      type: "line_item",
      content: defaults.child,
      order_index: index + 1,
    };

    const newBlocks = [...blocks];
    newBlocks.splice(index, 0, parentBlock, childBlock);

    const reindexed = newBlocks.map((b, i) => ({ ...b, order_index: i }));
    setBlocks(
      computeCommercialPositions(reindexed, { respectManualPositions: true })
    );
    toast.success(t("offers.blockAdded"));
    return parentBlock;
  };

  /**
   * Promote a child item to top-level (remove parent_id)
   */
  const promoteToTopLevel = (blockId: string) => {
    const blockIndex = blocks.findIndex((b) => b.id === blockId);
    if (blockIndex === -1) {
      return;
    }

    const block = blocks[blockIndex];
    if (!block.content?.parent_id) {
      return;
    }

    const updated = [...blocks];
    updated[blockIndex] = {
      ...block,
      content: { ...block.content, parent_id: null },
    };

    setBlocks(
      computeCommercialPositions(
        updated.map((b, i) => ({ ...b, order_index: i })),
        { respectManualPositions: true }
      )
    );
    toast.success(t("offers.blockPromoted"));
  };

  /**
   * Demote item one level down: make it a child of the previous sibling, or child of the previous top-level item.
   * Only top-level items can be demoted; sub-items must not be moved down further (would break structure).
   */
  const demoteToSubLevel = (blockId: string) => {
    const blockIndex = blocks.findIndex((b) => b.id === blockId);
    if (blockIndex === -1) {
      return;
    }

    const block = blocks[blockIndex];
    if (!isLineItem(block)) {
      return;
    }
    if (block.content?.parent_id) {
      return; // Already a sub-item - do not allow demoting further
    }

    // Find previous line_item
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
      prevItem.content?.parent_id == null
        ? prevItem.id
        : prevItem.content.parent_id;

    const blockWithNewParent = {
      ...block,
      content: { ...block.content, parent_id: newParentId },
    };

    // Insert after new parent or after new parent's last child
    const insertAfterIndex =
      newParentId === prevItem.id
        ? getChildIndices(blocks, newParentId).length > 0
          ? Math.max(...getChildIndices(blocks, newParentId))
          : prevItemIndex
        : prevItemIndex;

    const updated = [...blocks];
    updated.splice(blockIndex, 1);
    updated.splice(insertAfterIndex + 1, 0, blockWithNewParent);

    const reindexed = updated.map((b, i) => ({ ...b, order_index: i }));
    setBlocks(
      computeCommercialPositions(reindexed, { respectManualPositions: true })
    );
    toast.success(t("offers.blockDemoted"));
  };

  const deleteBlock = async (index: number) => {
    const block = blocks[index];
    if (!block.id.startsWith("temp-") && offerId) {
      await supabase.from("offer_blocks").delete().eq("id", block.id);
    }
    let updated = blocks.filter((_, i) => i !== index);

    // If deleting a line_item that is a parent, cascade delete children
    if (isLineItem(block)) {
      const children = getChildBlocks(blocks, block.id);
      for (const child of children) {
        if (!child.id.startsWith("temp-") && offerId) {
          await supabase.from("offer_blocks").delete().eq("id", child.id);
        }
      }
      updated = updated.filter(
        (b) => !(isLineItem(b) && b.content?.parent_id === block.id)
      );
    }

    const reindexed = updated.map((b, i) => ({ ...b, order_index: i }));
    setBlocks(
      computeCommercialPositions(reindexed, { respectManualPositions: true })
    );
    toast.success(t("offers.blockDeleted"));
  };

  const duplicateBlock = (index: number) => {
    const block = blocks[index];
    const newParentId = createTempId();

    const newBlock: OfferBlock = {
      id: newParentId,
      type: block.type,
      content: {
        ...block.content,
        parent_id: block.content?.parent_id ?? null,
      },
      order_index: index + 1,
    };

    const newBlocks = [...blocks];
    newBlocks.splice(index + 1, 0, newBlock);

    // If duplicating a parent, also duplicate its children
    if (isLineItem(block) && isGroupParent(blocks, block)) {
      const children = getChildBlocks(blocks, block.id);
      let insertOffset = 1;
      for (const child of children) {
        insertOffset++;
        const newChild: OfferBlock = {
          id: createTempId(),
          type: child.type,
          content: { ...child.content, parent_id: newParentId },
          order_index: index + insertOffset,
        };
        newBlocks.splice(index + insertOffset, 0, newChild);
      }
    }

    const reindexed = newBlocks.map((b, i) => ({ ...b, order_index: i }));
    setBlocks(computeCommercialPositions(reindexed));
    toast.success(t("offers.blockDuplicated"));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = blocks.findIndex((b) => b.id === active.id);
      const newIndex = blocks.findIndex((b) => b.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const draggedBlock = blocks[oldIndex];

        // Phase headlines can be dragged anywhere; each phase headline starts a new phase
        // (and implicitly ends the previous one), so moving reorders phases naturally.

        // Line item hierarchy validation
        if (
          isLineItem(draggedBlock) &&
          !isValidLineItemDrop(blocks, String(active.id), String(over.id))
        ) {
          toast.error(t("offers.cannotDropPositionHere", "Cannot drop here"));
          return;
        }

        // If dragging a group parent, move parent + children together
        if (isLineItem(draggedBlock) && isGroupParent(blocks, draggedBlock)) {
          const childIndices = getChildIndices(blocks, draggedBlock.id);
          const allIndices = [oldIndex, ...childIndices].sort((a, b) => a - b);

          // Remove parent and children from their current positions
          const movingBlocks = allIndices.map((i) => blocks[i]);
          const remaining = blocks.filter((_, i) => !allIndices.includes(i));

          // Compute adjusted target index in the remaining array
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

          // Insert all blocks at the new position
          remaining.splice(adjustedNewIndex, 0, ...movingBlocks);

          const reindexed = remaining.map((b, i) => ({ ...b, order_index: i }));
          setBlocks(
            computeCommercialPositions(reindexed, {
              respectManualPositions: true,
            })
          );
          return;
        }

        const reordered = arrayMove(blocks, oldIndex, newIndex);
        const reindexed = reordered.map((b, i) => ({ ...b, order_index: i }));
        setBlocks(
          computeCommercialPositions(reindexed, {
            respectManualPositions: true,
          })
        );
      }
    }
  };

  const saveBlocks = async () => {
    if (!offerId) {
      return;
    }

    for (const block of blocks) {
      if (block.id.startsWith("temp-")) {
        const { id: _, ...blockData } = block;
        await supabase.from("offer_blocks").insert({
          ...blockData,
          offer_id: offerId,
        });
      } else {
        await supabase
          .from("offer_blocks")
          .update({
            type: block.type,
            content: block.content,
            order_index: block.order_index,
          })
          .eq("id", block.id);
      }
    }
  };

  const setBlocksNormalized = (newBlocks: OfferBlock[]) => {
    setBlocks(
      computeCommercialPositions(newBlocks, { respectManualPositions: true })
    );
  };

  const recalculateIndex = () => {
    const cleared = blocks.map((b) => ({
      ...b,
      content: { ...b.content, position_manual: false },
    })) as OfferBlock[];
    setBlocks(computeCommercialPositions(cleared));
    toast.success(t("offers.indexRecalculated", "Index recalculated"));
  };

  return {
    blocks,
    setBlocks: setBlocksNormalized,
    setBlocksRaw: setBlocks,
    editingBlockId,
    demoteToSubLevel,
    setEditingBlockId,
    updateBlock,
    addBlock,
    addBlockAbove,
    addLineItemAbove,
    addSubItem,
    addGroup,
    promoteToTopLevel,
    deleteBlock,
    duplicateBlock,
    handleDragEnd,
    saveBlocks,
    recalculateIndex,
  };
};
