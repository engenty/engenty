import { requestApiJson } from "@engenty/api-client";

export interface TaxRate {
  is_default?: boolean;
  label: string;
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

export interface CommercialSettings {
  currency?: string | null;
  currency_symbol?: string | null;
  default_locale?: string | null;
  disciplines?: Discipline[] | null;
  expense_categories?: ExpenseCategory[] | null;
  no_tax_reason?: string | null;
  number_locale?: string | null;
  tax_rates?: TaxRate[] | null;
  units?: Unit[] | null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  return await requestApiJson<T>(path, init);
}

export async function getCommercialSettings(signal?: AbortSignal) {
  return request<CommercialSettings>("/api/commercial-settings", {
    method: "GET",
    signal,
  });
}

export async function getDisciplines(signal?: AbortSignal) {
  const settings = await getCommercialSettings(signal);
  return (settings.disciplines ?? []).filter(
    (row) => row.name.trim().length > 0
  );
}

export async function setCommercialSettings(input: CommercialSettings) {
  return request<CommercialSettings>("/api/commercial-settings", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
