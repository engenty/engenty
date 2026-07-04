import type { OfferListItem } from "../api.js";

export type DisplaySettingKey =
  | "showPhaseIndex"
  | "phaseIndexPattern"
  | "showTaxPerItem"
  | "showPhaseTotals"
  | "defaultTaxRate";

export function mapDisplaySettingPatch(
  key: DisplaySettingKey,
  value: boolean | string | number
): Partial<OfferListItem> {
  switch (key) {
    case "showPhaseIndex":
      return { show_phase_index: Boolean(value) };
    case "phaseIndexPattern":
      return { phase_index_pattern: String(value) };
    case "showTaxPerItem":
      return { show_tax_per_item: Boolean(value) };
    case "showPhaseTotals":
      return { show_phase_totals: Boolean(value) };
    case "defaultTaxRate":
      return { default_tax_rate: Number(value) || 0 };
    default:
      return {};
  }
}
