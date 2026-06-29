import {
  createGroupDefaults,
  createLineItemDefaults,
  getDefaultContent,
  getPhaseHeadlineDefaults,
  isPhaseHeadlineBlock,
  type LineItemSubtype,
} from "./commercial-core/constants/blockDefaults";
import { computeCommercialPositions } from "./commercial-core/engine/positions";
import type { CommercialBlock } from "./types";

function findPhaseBoundary(blocks: CommercialBlock[], blockIndex: number) {
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

function getChildIndices(
  blocks: CommercialBlock[],
  parentId: string
): number[] {
  return blocks
    .map((b, index) => ({ b, index }))
    .filter(
      ({ b }) =>
        b.type === "line_item" && (b.content as any)?.parent_id === parentId
    )
    .map(({ index }) => index);
}

export interface BlockMutationResult {
  blocks: CommercialBlock[];
  newBlock: CommercialBlock;
}

export function addBlockAt(
  blocks: CommercialBlock[],
  index: number,
  type: string,
  defaultTax: number,
  createId: () => string
): BlockMutationResult {
  let insertIndex = index;
  if (type === "phase_start") {
    const boundary = findPhaseBoundary(blocks, insertIndex);
    if (boundary) {
      insertIndex = boundary.end + 1;
    }
  }
  const isPhase = type === "phase_start";
  const newBlock = {
    id: createId(),
    type: isPhase ? "headline" : type,
    content: isPhase
      ? getPhaseHeadlineDefaults()
      : getDefaultContent(type, defaultTax),
    order_index: insertIndex,
  } as CommercialBlock;
  const next = [...blocks];
  next.splice(insertIndex, 0, newBlock);
  return {
    newBlock,
    blocks: computeCommercialPositions(
      next.map((b, i) => ({ ...b, order_index: i }))
    ),
  };
}

export function addLineItemAt(
  blocks: CommercialBlock[],
  index: number,
  subtype: LineItemSubtype,
  defaultTax: number,
  createId: () => string
): BlockMutationResult {
  const newBlock = {
    id: createId(),
    type: "line_item",
    content: createLineItemDefaults(subtype, defaultTax),
    order_index: index,
  } as CommercialBlock;
  const next = [...blocks];
  next.splice(index, 0, newBlock);
  return {
    newBlock,
    blocks: computeCommercialPositions(
      next.map((b, i) => ({ ...b, order_index: i })),
      { respectManualPositions: true }
    ),
  };
}

export function addSubItemToParent(
  blocks: CommercialBlock[],
  parentId: string,
  defaultTax: number,
  createId: () => string
): BlockMutationResult | null {
  const parentIndex = blocks.findIndex((b) => b.id === parentId);
  if (parentIndex === -1) {
    return null;
  }
  const childIndices = getChildIndices(blocks, parentId);
  const insertAfter =
    childIndices.length > 0 ? Math.max(...childIndices) : parentIndex;
  const newBlock = {
    id: createId(),
    type: "line_item",
    content: {
      ...createLineItemDefaults("position", defaultTax),
      parent_id: parentId,
    },
    order_index: insertAfter + 1,
  } as CommercialBlock;
  const next = [...blocks];
  next.splice(insertAfter + 1, 0, newBlock);
  return {
    newBlock,
    blocks: computeCommercialPositions(
      next.map((b, i) => ({ ...b, order_index: i })),
      { respectManualPositions: true }
    ),
  };
}

export function addGroupAt(
  blocks: CommercialBlock[],
  index: number,
  defaultTax: number,
  createId: () => string
): BlockMutationResult {
  const parentId = createId();
  const defaults = createGroupDefaults(parentId, defaultTax);
  const parentBlock = {
    id: parentId,
    type: "line_item",
    content: defaults.parent,
    order_index: index,
  } as CommercialBlock;
  const childBlock = {
    id: createId(),
    type: "line_item",
    content: defaults.child,
    order_index: index + 1,
  } as CommercialBlock;
  const next = [...blocks];
  next.splice(index, 0, parentBlock, childBlock);
  return {
    newBlock: parentBlock,
    blocks: computeCommercialPositions(
      next.map((b, i) => ({ ...b, order_index: i })),
      { respectManualPositions: true }
    ),
  };
}

export function recalculateCommercialIndex(
  blocks: CommercialBlock[]
): CommercialBlock[] {
  const cleared = blocks.map((b) => ({
    ...b,
    content: { ...(b.content as any), position_manual: false },
  })) as CommercialBlock[];
  return computeCommercialPositions(cleared);
}
