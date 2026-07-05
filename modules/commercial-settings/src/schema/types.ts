export interface TaxRate {
  /** At most one `true` across user-defined rates (not used for built-in 0% row). */
  is_default?: boolean;
  /** Display label (Bezeichnung) */
  label: string;
  /** Short key / abbreviation (Kürzel), unique per tenant list */
  name: string;
  value: number;
}

export interface Unit {
  label: string;
  name: string;
  singular?: string;
}

export interface Discipline {
  name: string;
  rate: number;
  short: string;
}

export interface ExpenseCategory {
  code: string;
  color?: string | null;
  default_deduction_rate: number;
  is_tax_deductible: boolean;
  llm_hint?: string | null;
  name: string;
  parent_code?: string | null;
  sort_order?: number;
}

export interface TaxDeductionRule {
  category_code: string;
  description?: string;
  rate: number;
}

export interface CommercialSettings {
  currency?: string | null;
  currency_symbol?: string | null;
  default_locale?: string | null;
  disciplines?: Discipline[] | null;
  expense_categories?: ExpenseCategory[] | null;
  no_tax_reason?: string | null;
  number_locale?: string | null;
  tax_deduction_rules?: TaxDeductionRule[] | null;
  tax_rates?: TaxRate[] | null;
  units?: Unit[] | null;
}

export type CommercialSettingsInput = Partial<CommercialSettings>;
