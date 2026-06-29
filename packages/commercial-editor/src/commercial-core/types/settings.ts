export interface CommercialSettings {
  default_tax_rate?: number;
  no_tax_reason?: string | null;
  phase_index_pattern?: string;
  phases_enabled?: boolean;
  show_phase_index?: boolean;
  show_phase_totals?: boolean;
  show_tax_per_item?: boolean;
}
