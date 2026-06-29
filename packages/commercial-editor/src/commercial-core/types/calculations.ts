export interface CommercialTaxBreakdown {
  amount: number;
  rate: number;
}

export interface CommercialTotals {
  showTaxes: boolean;
  subtotal: number;
  taxAmount: number;
  taxBreakdown: CommercialTaxBreakdown[];
  total: number;
}

export interface CommercialPhaseTotals {
  /** From phase headline content (null for general). */
  billing_type?: string | null;
  /** Phase headline block id (null for general section). */
  phaseBlockId?: string | null;
  phaseNumber: number | null;
  subtotal: number;
  title: string | null;
}
