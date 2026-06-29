import {
  getLineItemSubtype,
  isPhaseHeadlineBlock,
} from "../constants/blockDefaults";
import type { CommercialBlock } from "../types/blocks";

export interface ComputeCommercialPositionsOptions {
  /** When true, do not change position for blocks with content.position_manual === true */
  respectManualPositions?: boolean;
}

function isLineItem(block: CommercialBlock): boolean {
  return block.type === "line_item";
}

function isContentBlock(block: CommercialBlock): boolean {
  return (
    block.type === "text" ||
    block.type === "headline" ||
    block.type === "subheading"
  );
}

function isPositionManual(
  content: Record<string, unknown> | null | undefined
): boolean {
  return content?.position_manual === true;
}

export function computeCommercialPositions<T extends CommercialBlock>(
  blocks: T[],
  options?: ComputeCommercialPositionsOptions
): T[] {
  const respectManual = options?.respectManualPositions === true;

  const topLevelPositions = new Map<string, string>();
  if (respectManual) {
    for (const block of blocks) {
      if (!isLineItem(block)) {
        continue;
      }
      if (!isPositionManual(block.content as Record<string, unknown>)) {
        continue;
      }
      const pos = (block.content as Record<string, unknown>)?.position;
      if (pos != null && typeof pos === "string") {
        topLevelPositions.set(block.id, pos);
      }
    }
  }

  let sectionIndex = 0;
  let itemCounter = 0;
  let previousWasLineItem = false;

  for (const block of blocks) {
    if (isPhaseHeadlineBlock(block) || isContentBlock(block)) {
      previousWasLineItem = false;
      continue;
    }

    if (!isLineItem(block)) {
      previousWasLineItem = false;
      continue;
    }

    if (!previousWasLineItem) {
      sectionIndex += 1;
      itemCounter = 0;
    }
    previousWasLineItem = true;

    if ((block.content as Record<string, unknown>)?.parent_id) {
      continue;
    }

    if (
      respectManual &&
      isPositionManual(block.content as Record<string, unknown>)
    ) {
      continue;
    }

    const subtype = getLineItemSubtype(block.content);
    const hasChildren = blocks.some(
      (b) =>
        isLineItem(b) &&
        (b.content as Record<string, unknown>)?.parent_id === block.id
    );

    if (subtype === "headline") {
      if (hasChildren) {
        // Group parent (grouped position): number as next item in current section (e.g. 2.2), not a new top-level index
        itemCounter += 1;
        topLevelPositions.set(block.id, `${sectionIndex}.${itemCounter}`);
      } else {
        const isFirstInBlock = itemCounter === 0;
        if (!isFirstInBlock) {
          sectionIndex += 1;
          itemCounter = 0;
        }
        topLevelPositions.set(block.id, `${sectionIndex}`);
      }
      continue;
    }

    if (subtype === "text" || subtype === "page_break") {
      continue;
    }
    if (hasChildren && subtype !== "position") {
      continue;
    }

    itemCounter += 1;
    topLevelPositions.set(block.id, `${sectionIndex}.${itemCounter}`);
  }

  return blocks.map((block) => {
    if (!isLineItem(block)) {
      return block;
    }

    const content = block.content as Record<string, unknown> | undefined;
    if (respectManual && isPositionManual(content)) {
      return block;
    }

    const contentRec = block.content as Record<string, unknown>;
    if (contentRec?.parent_id) {
      const parentPos = topLevelPositions.get(contentRec.parent_id as string);
      if (parentPos) {
        const siblings = blocks.filter(
          (b) =>
            isLineItem(b) &&
            (b.content as Record<string, unknown>)?.parent_id ===
              contentRec.parent_id
        );
        const childIndex = siblings.findIndex((b) => b.id === block.id) + 1;
        const position = `${parentPos}.${childIndex}`;
        return { ...block, content: { ...block.content, position } };
      }
      return { ...block, content: { ...block.content, position: null } };
    }

    const position = topLevelPositions.get(block.id) ?? null;
    return { ...block, content: { ...block.content, position } };
  }) as T[];
}

/** Block shape needed for getNextPositionForNewBlock (id, type, content with position and parent_id). */
export interface BlockWithPosition {
  content?: Record<string, unknown> | null;
  id: string;
  type: string;
}

/**
 * Returns the next position string for a new line item.
 * - Top-level (no parentId): next top-level index (e.g. "1", "2", "3"); if none, "1".
 * - Sub-item (parentId): next child under parent (e.g. "1.1", "1.2"); parent must have a position.
 */
export function getNextPositionForNewBlock(
  blocks: BlockWithPosition[],
  options?: { parentId?: string | null }
): string {
  const parentId = options?.parentId ?? null;

  if (parentId) {
    const parent = blocks.find((b) => b.id === parentId);
    const parentPos = parent?.content?.position as string | undefined;
    if (!parentPos) {
      return "1.1";
    }
    const siblings = blocks.filter(
      (b) =>
        b.type === "line_item" && (b.content?.parent_id as string) === parentId
    );
    const nextChildIndex = siblings.length + 1;
    return `${parentPos}.${nextChildIndex}`;
  }

  const lineItems = blocks.filter(
    (b) => b.type === "line_item" && !(b.content?.parent_id as string)
  );
  const topLevelNumbers: number[] = [];
  for (const b of lineItems) {
    const pos = b.content?.position as string | undefined;
    if (pos && typeof pos === "string") {
      const firstPart = pos.split(".")[0];
      const num = Number.parseInt(firstPart, 10);
      if (!Number.isNaN(num)) {
        topLevelNumbers.push(num);
      }
    }
  }
  const max = topLevelNumbers.length > 0 ? Math.max(...topLevelNumbers) : 0;
  return String(max + 1);
}
