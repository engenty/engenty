import { isPhaseHeadlineBlock } from "../constants/blockDefaults";
import type { CommercialBlock } from "../types/blocks";

/**
 * Returns the ordered list of blocks that belong to the given phase or general section.
 * - If offerPhaseId === null: blocks from start until the first phase headline (excl.).
 * - If offerPhaseId is a phase headline block id: that headline plus all blocks until
 *   the next phase headline (excl.) or end of document.
 */
export function getOfferBlocksForPhase(
  blocks: CommercialBlock[],
  offerPhaseId: string | null
): CommercialBlock[] {
  const ordered = [...blocks].sort((a, b) => a.order_index - b.order_index);

  if (offerPhaseId === null) {
    const firstPhaseIndex = ordered.findIndex(isPhaseHeadlineBlock);
    if (firstPhaseIndex === -1) {
      return ordered;
    }
    return ordered.slice(0, firstPhaseIndex);
  }

  const phaseIndex = ordered.findIndex((b) => b.id === offerPhaseId);
  if (phaseIndex === -1) {
    return [];
  }

  const phaseBlock = ordered[phaseIndex];
  if (!isPhaseHeadlineBlock(phaseBlock)) {
    return [];
  }

  const nextPhaseIndex = ordered.findIndex(
    (b, i) => i > phaseIndex && isPhaseHeadlineBlock(b)
  );
  const end = nextPhaseIndex === -1 ? ordered.length : nextPhaseIndex;
  return ordered.slice(phaseIndex, end);
}
