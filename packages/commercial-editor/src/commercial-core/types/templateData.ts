import type { LineItemSubtype } from "./blocks";

export interface CommercialTemplateDataSection {
  blocks: CommercialTemplateDataBlock[];
  content: CommercialTemplateDataContentBlock[];
  index: number;
  subtotal: number;
  subtotal_formatted: string;
  title: string | null;
}

export interface CommercialTemplateDataGroup {
  phase: CommercialTemplateDataPhase | null;
  sections: CommercialTemplateDataSection[];
  subtotal: number;
  subtotal_formatted: string;
  type: "general" | "phase";
}

export interface CommercialTemplateDataPhase {
  billing_type?: string | null;
  content: string | null;
  timeframe_from?: string | null;
  timeframe_until?: string | null;
  title: string | null;
}

export interface CommercialTemplateDataBlock {
  content: string | null;
  entries: CommercialTemplateDataLineItemsEntry[];
  position: string;
  subtotal: number;
  subtotal_formatted: string;
  title: string | null;
  type: "line_items";
}

export type CommercialTemplateDataLineItemsEntry =
  | { type: "item"; item: CommercialTemplateDataItem }
  | { type: "bundle"; bundle: CommercialTemplateDataBundle };

export interface CommercialTemplateDataBundle {
  content: string | null;
  items: CommercialTemplateDataItem[];
  position: string;
  subtotal: number;
  subtotal_formatted: string;
  title: string | null;
}

export interface CommercialTemplateDataContentBlock {
  content: string | null;
  type: "text";
}

export interface CommercialTemplateDataItem {
  amount: number;
  block_position: string;
  content: string | null;
  cost_per_item: number;
  cost_per_item_formatted: string;
  entry_position: string;
  line_item_subtype?: LineItemSubtype;
  position: string;
  tax: number;
  tax_formatted: string;
  title: string;
  total: number;
  total_formatted: string;
  unit: string;
  unit_display?: string;
}

export interface CommercialTemplateDataTotals {
  currency: string;
  no_tax_reason?: string | null;
  phase_totals: {
    title: string | null;
    label: string;
    subtotal: number;
    subtotal_formatted: string;
  }[];
  show_phase_totals: boolean;
  show_taxes: boolean;
  subtotal: number;
  subtotal_formatted: string;
  taxAmount: number;
  taxAmount_formatted: string;
  taxes: {
    rate: number;
    amount: number;
    rate_formatted: string;
    amount_formatted: string;
  }[];
  total: number;
  total_formatted: string;
}

export type CommercialPhaseNumberingFormat =
  | "none"
  | "phase_n"
  | "n_dot"
  | "letter"
  | "roman";

export interface CommercialTemplateDataConfig {
  phase_numbering_format: CommercialPhaseNumberingFormat;
  show_phase_subtotals: boolean;
  show_phase_totals: boolean;
  show_tax_per_item: boolean;
}
