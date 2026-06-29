import type { CommercialDocumentInput } from "../../types/document";
import type {
  CommercialTemplateDataConfig,
  CommercialTemplateDataGroup,
  CommercialTemplateDataTotals,
} from "../../types/templateData";
import { calculateCommercialPhaseTotals } from "../calculations/phaseTotals";
import { calculateCommercialTotals } from "../calculations/totals";
import { groupCommercialBlocks } from "../grouping";
import { createFormatter, formatOptionalDate } from "./formatters";

export interface CommercialTemplateDataResult {
  config: CommercialTemplateDataConfig;
  content: CommercialTemplateDataGroup[];
  totals: CommercialTemplateDataTotals;
}

const defaultConfig: CommercialTemplateDataConfig = {
  phase_numbering_format: "none",
  show_phase_subtotals: false,
  show_tax_per_item: true,
  show_phase_totals: false,
};

export function buildCommercialTemplateData(
  input: CommercialDocumentInput
): CommercialTemplateDataResult {
  const phasesEnabled =
    input.phases_enabled ?? Boolean(input.settings?.phases_enabled);
  const showPhaseTotalsSetting = input.settings?.show_phase_totals ?? false;
  const effectiveShowPhaseTotals = phasesEnabled && showPhaseTotalsSetting;
  const showTaxPerItem = input.settings?.show_tax_per_item ?? true;

  const templateConfig: CommercialTemplateDataConfig = {
    ...defaultConfig,
    show_phase_subtotals: effectiveShowPhaseTotals,
    show_phase_totals: effectiveShowPhaseTotals,
    show_tax_per_item: showTaxPerItem,
  };

  const effectiveDefaultTaxRate = showTaxPerItem
    ? undefined
    : input.settings?.default_tax_rate;
  const calculatedTotals = calculateCommercialTotals(
    input.blocks,
    effectiveDefaultTaxRate
  );
  const formatter = createFormatter(input.locale, input.currency);

  const timeframeFrom = formatOptionalDate(input.timeframe_from);
  const timeframeUntil = formatOptionalDate(input.timeframe_until);

  // Use stored block positions only; no recalculation for summary/PDF display
  const groupedContent = groupCommercialBlocks(
    input.blocks,
    formatter,
    input.locale,
    input.currency,
    phasesEnabled,
    timeframeFrom,
    timeframeUntil,
    effectiveDefaultTaxRate
  );

  const phaseTotals = calculateCommercialPhaseTotals(input.blocks)
    .filter((phase) => phase.subtotal > 0)
    .map((phase) => ({
      title: phase.title,
      label: phase.title ?? "Allgemein",
      subtotal: phase.subtotal,
      subtotal_formatted: formatter.format(phase.subtotal),
    }));

  const totals: CommercialTemplateDataTotals = {
    subtotal: calculatedTotals.subtotal,
    taxAmount: calculatedTotals.taxAmount,
    total: calculatedTotals.total,
    currency: input.currency,
    subtotal_formatted: formatter.format(calculatedTotals.subtotal),
    taxAmount_formatted: formatter.format(calculatedTotals.taxAmount),
    total_formatted: formatter.format(calculatedTotals.total),
    taxes: calculatedTotals.taxBreakdown.map((t) => ({
      rate: t.rate,
      amount: t.amount,
      rate_formatted: `${t.rate}%`,
      amount_formatted: formatter.format(t.amount),
    })),
    show_taxes: calculatedTotals.showTaxes,
    no_tax_reason: input.settings?.no_tax_reason ?? null,
    phase_totals: phaseTotals,
    show_phase_totals: effectiveShowPhaseTotals,
  };

  return {
    content: groupedContent,
    totals,
    config: templateConfig,
  };
}
