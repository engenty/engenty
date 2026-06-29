/**
 * Group blocks for editor rendering.
 * Shared by offer and invoice editors.
 *
 * Structure rules:
 * - Consecutive line_items are collected into one virtual block (LineItemsTable)
 * - Content blocks (headline, text, subheading) SPLIT line item runs
 * - There can be multiple line_item virtual blocks per phase/general group, separated by content
 *
 * Example: [line_item, line_item, text, line_item] →
 *   segments: [line_items(2), content(text), line_items(1)]
 */

import {
  isPhaseHeadlineBlock,
  isSpecialLineItem,
} from "../constants/blockDefaults";

/** Minimal block shape for editor grouping - compatible with offer and invoice blocks */
export interface EditorBlock {
  content: any;
  id: string;
  order_index: number;
  type: string;
}

/** A single content block (headline, text, subheading). sectionIndex set when headline precedes line_items. */
export interface EditorContentSegment {
  block: EditorBlock;
  sectionIndex?: number | null;
  type: "content";
}

/** Consecutive line_item blocks rendered as one table */
export interface EditorLineItemsSegment {
  items: EditorBlock[];
  sectionIndex?: number | null;
  type: "line_items";
}

export type EditorSegment = EditorContentSegment | EditorLineItemsSegment;

export interface EditorBlockGroup {
  phaseBlock: EditorBlock | null;
  phaseIndex: number | null;
  /** Section index for phaseBlock when it directly precedes line_items */
  phaseSectionIndex: number | null;
  /** Ordered segments: content blocks and line_item groups in document order */
  segments: EditorSegment[];
  subtotal: number;
  type: "phase" | "general";
}

function isLineItem(block: EditorBlock): boolean {
  return block.type === "line_item";
}

function isContentBlock(block: EditorBlock): boolean {
  return (
    block.type === "text" ||
    block.type === "headline" ||
    block.type === "subheading"
  );
}

/** Sum line item totals (excludes special items: headline, text, page_break) */
export function calculateLineItemsSubtotal(items: EditorBlock[]): number {
  return items.reduce((sum, item) => {
    if (isSpecialLineItem(item.content)) {
      return sum;
    }
    const amount =
      item.content?.unit === "fixed" ? 1 : item.content?.amount || 0;
    const cost = item.content?.cost_per_item || 0;
    return sum + amount * cost;
  }, 0);
}

export function groupBlocksForEditor(
  blocks: EditorBlock[]
): EditorBlockGroup[] {
  const groups: EditorBlockGroup[] = [];
  let sectionCounter = 0;

  let currentGroup: EditorBlockGroup = {
    type: "general",
    phaseIndex: null,
    phaseBlock: null,
    phaseSectionIndex: null,
    segments: [],
    subtotal: 0,
  };

  /** Accumulated line items for the current run (flushed when content block is seen) */
  let currentLineItems: EditorBlock[] = [];

  const flushLineItems = () => {
    if (currentLineItems.length === 0) {
      return;
    }

    const hasPositionItem = currentLineItems.some(
      (item) => !isSpecialLineItem(item.content)
    );

    if (!hasPositionItem) {
      // Keep special-only line item runs (e.g. page breaks) as their own segment so
      // they can appear between content blocks too.
      currentGroup.segments.push({
        type: "line_items",
        items: [...currentLineItems],
      });
      currentGroup.subtotal += calculateLineItemsSubtotal(currentLineItems);
      currentLineItems = [];
      return;
    }

    sectionCounter++;
    const sectionIndex = sectionCounter;
    const itemsToAdd = [...currentLineItems];

    // Phase index numbering only applies to phase headings - find the most recent phase headline before line items
    let assigned = false;
    for (let i = currentGroup.segments.length - 1; i >= 0; i--) {
      const seg = currentGroup.segments[i];
      if (seg.type === "content" && isPhaseHeadlineBlock(seg.block)) {
        (seg as EditorContentSegment).sectionIndex = sectionIndex;
        assigned = true;
        break;
      }
    }
    if (!assigned && currentGroup.phaseBlock) {
      currentGroup.phaseSectionIndex = sectionIndex;
    }
    currentGroup.segments.push({
      type: "line_items",
      items: itemsToAdd,
      sectionIndex,
    });
    currentGroup.subtotal += calculateLineItemsSubtotal(itemsToAdd);
    currentLineItems = [];
  };

  const hasGroupContent = () =>
    currentGroup.segments.length > 0 ||
    currentLineItems.length > 0 ||
    currentGroup.phaseBlock;

  let phaseCounter = 0;

  for (const block of blocks) {
    if (isPhaseHeadlineBlock(block)) {
      flushLineItems();
      if (hasGroupContent()) {
        groups.push(currentGroup);
      }

      currentGroup = {
        type: "phase",
        phaseIndex: phaseCounter,
        phaseBlock: block,
        phaseSectionIndex: null,
        segments: [],
        subtotal: 0,
      };
      phaseCounter++;
    } else if (isLineItem(block)) {
      currentLineItems.push(block);
    } else if (isContentBlock(block)) {
      flushLineItems();
      currentGroup.segments.push({ type: "content", block });
    }
  }

  flushLineItems();
  if (hasGroupContent()) {
    groups.push(currentGroup);
  }

  return groups;
}

/**
 * Get all block IDs in document order for SortableContext
 */
export function getBlockIdsFromGroups(groups: EditorBlockGroup[]): string[] {
  const ids: string[] = [];

  for (const group of groups) {
    if (group.phaseBlock) {
      ids.push(group.phaseBlock.id);
    }
    for (const seg of group.segments) {
      if (seg.type === "content") {
        ids.push(seg.block.id);
      } else {
        for (const item of seg.items) {
          ids.push(item.id);
        }
      }
    }
  }

  return ids;
}

/**
 * Check if a block at the given index is within a line items group
 * (i.e., between two line items)
 */
export function isWithinLineItemsGroup(
  blocks: EditorBlock[],
  targetIndex: number
): boolean {
  const prevBlock = blocks[targetIndex - 1];
  const nextBlock = blocks[targetIndex];

  const prevIsItem = prevBlock && isLineItem(prevBlock);
  const nextIsItem = nextBlock && isLineItem(nextBlock);

  return prevIsItem && nextIsItem;
}

/**
 * Check if block type is a content block type
 */
export function isContentBlockType(type: string): boolean {
  return type === "text" || type === "headline" || type === "subheading";
}
