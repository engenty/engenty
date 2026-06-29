import { isPhaseHeadlineBlock } from "../../constants/blockDefaults";
import type { CommercialBlock } from "../../types/blocks";
import type { CommercialPhaseTotals } from "../../types/calculations";

function isLineItem(block: CommercialBlock): boolean {
  return block.type === "line_item";
}

export function calculateCommercialPhaseTotals(
  blocks: CommercialBlock[]
): CommercialPhaseTotals[] {
  const phaseTotals: CommercialPhaseTotals[] = [];

  let currentPhaseTitle: string | null = null;
  let currentPhaseBlockId: string | null = null;
  let currentPhaseBillingType: string | null = null;
  let currentPhaseSubtotal = 0;
  let currentPhaseHasItems = false;
  let currentPhaseNumber = 0;
  let isInPhase = false;

  let generalSubtotal = 0;
  let generalHasItems = false;

  for (const block of blocks) {
    if (isPhaseHeadlineBlock(block)) {
      if (isInPhase && currentPhaseHasItems) {
        phaseTotals.push({
          title: currentPhaseTitle,
          subtotal: currentPhaseSubtotal,
          phaseNumber: currentPhaseNumber,
          phaseBlockId: currentPhaseBlockId,
          billing_type: currentPhaseBillingType,
        });
      }

      currentPhaseNumber += 1;
      currentPhaseTitle = (block.content?.title as string) || null;
      currentPhaseBlockId = block.id;
      currentPhaseBillingType =
        (block.content as { billing_type?: string | null })?.billing_type ??
        null;
      currentPhaseSubtotal = 0;
      currentPhaseHasItems = false;
      isInPhase = true;
      continue;
    }

    if (isLineItem(block)) {
      const c = block.content as Record<string, unknown>;
      const amount = Number(c.amount) || 0;
      const costPerItem = Number(c.cost_per_item) || 0;
      const itemTotal = amount * costPerItem;

      if (isInPhase) {
        currentPhaseHasItems = true;
        currentPhaseSubtotal += itemTotal;
      } else {
        generalHasItems = true;
        generalSubtotal += itemTotal;
      }
    }
  }

  if (isInPhase && currentPhaseHasItems) {
    phaseTotals.push({
      title: currentPhaseTitle,
      subtotal: currentPhaseSubtotal,
      phaseNumber: currentPhaseNumber,
      phaseBlockId: currentPhaseBlockId,
      billing_type: currentPhaseBillingType,
    });
  }

  if (generalHasItems) {
    phaseTotals.unshift({
      title: null,
      subtotal: generalSubtotal,
      phaseNumber: null,
    });
  }

  return phaseTotals;
}
