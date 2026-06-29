import type { CommercialBlock as OfferBlock } from "../../types";
import { CommercialBlockTotals } from "../components";

interface BlockTotalsProps {
  blocks: OfferBlock[];
  currency: string;
  defaultTaxRate?: number;
  locale?: string;
  noTaxReason?: string | null;
  phaseIndexPattern?: string;
  showPhaseIndex?: boolean;
  showPhaseTotals?: boolean;
  showTaxPerItem?: boolean;
}

export const BlockTotals = ({
  blocks,
  currency,
  locale = "de-DE",
  showTaxPerItem = true,
  defaultTaxRate,
  noTaxReason,
  showPhaseTotals = false,
  showPhaseIndex = true,
  phaseIndexPattern = "1.",
}: BlockTotalsProps) => (
  <CommercialBlockTotals
    blocks={blocks as any}
    currency={currency}
    defaultTaxRate={defaultTaxRate}
    documentType="offer"
    hideWhenNoItems={false}
    locale={locale}
    noTaxReason={noTaxReason}
    phaseIndexPattern={phaseIndexPattern}
    showPhaseIndex={showPhaseIndex}
    showPhaseTotals={showPhaseTotals}
    showTaxPerItem={showTaxPerItem}
  />
);
