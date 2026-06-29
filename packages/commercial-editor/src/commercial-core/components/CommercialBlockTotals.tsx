import { useTranslation } from "@engenty/i18n/ui";
import { calculateCommercialPhaseTotals } from "../engine/calculations/phaseTotals";
import {
  calculateCommercialTotals,
  hasItemBlocks,
} from "../engine/calculations/totals";
import type { CommercialBlock } from "../types/blocks";
import { formatPhaseIndex } from "../utils/formatPhaseIndex";

export type CommercialDocumentType = "offer" | "invoice";

interface CommercialBlockTotalsProps {
  blocks: CommercialBlock[];
  currency: string;
  defaultTaxRate?: number;
  documentType: CommercialDocumentType;
  /** When true (invoice default), return null if no line items. When false (offer default), always render. */
  hideWhenNoItems?: boolean;
  locale?: string;
  noTaxReason?: string | null;
  phaseIndexPattern?: string;
  showPhaseIndex?: boolean;
  showPhaseTotals?: boolean;
  showTaxPerItem?: boolean;
}

export const CommercialBlockTotals = ({
  blocks,
  documentType,
  currency,
  locale = "de-DE",
  showTaxPerItem = true,
  defaultTaxRate,
  noTaxReason,
  showPhaseTotals = false,
  showPhaseIndex = true,
  phaseIndexPattern = "1.",
  hideWhenNoItems = documentType === "invoice",
}: CommercialBlockTotalsProps) => {
  const { t } = useTranslation("offers");

  if (hideWhenNoItems && !hasItemBlocks(blocks)) {
    return null;
  }

  const effectiveDefaultTaxRate = showTaxPerItem ? undefined : defaultTaxRate;

  const { subtotal, taxBreakdown, total, showTaxes } =
    calculateCommercialTotals(blocks, effectiveDefaultTaxRate);

  const phaseTotals = showPhaseTotals
    ? calculateCommercialPhaseTotals(blocks)
    : [];
  const showPhaseBreakdown =
    showPhaseTotals && phaseTotals.some((p) => p.phaseNumber !== null);

  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const phaseKey = documentType === "offer" ? "offers.phase" : "invoices.phase";
  const totalsPrefix = `${documentType}s.totals`;

  const formatPhaseLabel = (phase: {
    title: string | null;
    phaseNumber: number | null;
  }): string => {
    if (phase.phaseNumber === null) {
      return t("common.general");
    }

    const indexPart = showPhaseIndex
      ? formatPhaseIndex(phaseIndexPattern, phase.phaseNumber)
      : "";
    const titlePart = phase.title || "";

    if (indexPart && titlePart) {
      return `${indexPart} ${titlePart}`;
    }
    return indexPart || titlePart || t(phaseKey);
  };

  return (
    <div className="mt-6 space-y-2 border-t pt-4">
      {showPhaseBreakdown && (
        <div className="mb-4 space-y-1 border-b pb-4">
          {documentType === "invoice" && (
            <div className="flex items-center justify-end gap-4 text-base">
              <span className="text-muted-foreground">
                {t(`${totalsPrefix}.subtotals`)}:
              </span>
              <span className="min-w-[120px]" />
            </div>
          )}
          {phaseTotals.map((phase, idx) => (
            <div
              className="flex items-center justify-end gap-4 text-sm"
              key={idx}
            >
              <span className="text-muted-foreground">
                {formatPhaseLabel(phase)}
              </span>
              <span className="min-w-[120px] text-right font-medium tabular-nums">
                {formatter.format(phase.subtotal)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-end gap-4 text-base">
        <span className="text-muted-foreground">
          {t(`${totalsPrefix}.netTotal`)}:
        </span>
        <span className="min-w-[120px] text-right">
          {formatter.format(subtotal)}
        </span>
      </div>

      {!showTaxPerItem &&
        defaultTaxRate === 0 &&
        noTaxReason &&
        documentType === "offer" && (
          <div className="flex items-center justify-end gap-4 text-base text-muted-foreground">
            <span className="text-right italic">{noTaxReason}</span>
          </div>
        )}
      {showTaxes &&
        taxBreakdown.map((tax, idx) => (
          <div
            className="flex items-center justify-end gap-4 text-base"
            key={idx}
          >
            <span className="text-muted-foreground">
              {t(`${totalsPrefix}.tax`)} {tax.rate}%:
            </span>
            <span className="min-w-[120px] text-right">
              {formatter.format(tax.amount)}
            </span>
          </div>
        ))}

      <div className="flex items-center justify-end gap-4 border-t pt-2 font-semibold text-lg">
        <span>{t(`${totalsPrefix}.grossTotal`)}:</span>
        <span className="min-w-[120px] text-right">
          {formatter.format(total)}
        </span>
      </div>
    </div>
  );
};
