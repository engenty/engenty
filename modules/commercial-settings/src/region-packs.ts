import atChart from "../data/AT/chart.json";
import atCategories from "../data/AT/expense-categories.json";
import atTax from "../data/AT/tax-rates.json";
import chChart from "../data/CH/chart.json";
import chCategories from "../data/CH/expense-categories.json";
import chTax from "../data/CH/tax-rates.json";
import deChart from "../data/DE/chart.json";
import deCategories from "../data/DE/expense-categories.json";
import deTax from "../data/DE/tax-rates.json";
import gbTax from "../data/GB/tax-rates.json";
import type { ExpenseCategory, TaxRate } from "./schema/types.js";

export type CategoryPreset = Pick<
  ExpenseCategory,
  | "account_class"
  | "account_number"
  | "code"
  | "default_deduction_rate"
  | "is_tax_deductible"
  | "llm_hint"
  | "name"
> & {
  account_name?: string | null;
};

export type TaxPreset = Pick<TaxRate, "label" | "name" | "value">;

export interface ChartPack {
  classes: Array<{ class: string; name: string; range: string }>;
  id: string;
  name: string;
  region: string;
  short_name: string;
  standard?: string;
}

export interface RegionPackSummary {
  category_count: number;
  chart_id: string | null;
  chart_name: string | null;
  expense_class: string | null;
  region: string;
  short_name: string | null;
  tax_rate_count: number;
}

export type ChartAccountMatch = CategoryPreset & { region: string };

function categoryPresets(pack: {
  categories: readonly CategoryPreset[];
}): CategoryPreset[] {
  return pack.categories.map((c) => ({
    account_class: c.account_class ?? null,
    account_name: c.account_name ?? null,
    account_number: c.account_number ?? null,
    code: c.code,
    default_deduction_rate: c.default_deduction_rate,
    is_tax_deductible: c.is_tax_deductible,
    llm_hint: c.llm_hint,
    name: c.name,
  }));
}

function taxPresets(pack: { rates: readonly TaxPreset[] }): TaxPreset[] {
  return pack.rates.map((r) => ({
    label: r.label,
    name: r.name,
    value: r.value,
  }));
}

/** Expense category packs keyed by ISO 3166-1 alpha-2 region. */
export const STANDARD_CATEGORY_PRESETS: Record<string, CategoryPreset[]> = {
  AT: categoryPresets(atCategories),
  CH: categoryPresets(chCategories),
  DE: categoryPresets(deCategories),
};

/** Tax rate packs keyed by ISO 3166-1 alpha-2 region. */
export const STANDARD_TAX_PRESETS: Record<string, TaxPreset[]> = {
  AT: taxPresets(atTax),
  CH: taxPresets(chTax),
  DE: taxPresets(deTax),
  GB: taxPresets(gbTax),
  US: [],
};

export const CHART_PACKS: Record<string, ChartPack> = {
  AT: atChart,
  CH: chChart,
  DE: deChart,
};

export const REGION_PACK_IDS = ["AT", "CH", "DE", "GB"] as const;

export function accountClassFromNumber(
  accountNumber: string | null | undefined
): string | null {
  const digit = String(accountNumber ?? "").match(/^[0-9]/)?.[0];
  return digit ?? null;
}

/** `de-AT` → `AT`; `AT` → `AT`. */
export function normalizeRegion(input: string | null | undefined): string {
  const trimmed = String(input ?? "").trim();
  if (!trimmed) {
    return "";
  }
  const localeMatch = trimmed.match(/^[a-z]{2}-([a-z]{2})$/i);
  if (localeMatch?.[1]) {
    return localeMatch[1].toUpperCase();
  }
  return trimmed.toUpperCase();
}

export function listRegionPackSummaries(): RegionPackSummary[] {
  return REGION_PACK_IDS.map((region) => {
    const chart = CHART_PACKS[region] ?? null;
    const categories = STANDARD_CATEGORY_PRESETS[region] ?? [];
    const taxRates = STANDARD_TAX_PRESETS[region] ?? [];
    return {
      category_count: categories.length,
      chart_id: chart?.id ?? null,
      chart_name: chart?.name ?? null,
      expense_class: categories[0]?.account_class ?? null,
      region,
      short_name: chart?.short_name ?? null,
      tax_rate_count: taxRates.length,
    };
  });
}

export function getRegionPack(regionInput: string): {
  categories: CategoryPreset[];
  chart: ChartPack | null;
  region: string;
  tax_rates: TaxPreset[];
} {
  const region = normalizeRegion(regionInput);
  return {
    categories: STANDARD_CATEGORY_PRESETS[region] ?? [],
    chart: CHART_PACKS[region] ?? null,
    region,
    tax_rates: STANDARD_TAX_PRESETS[region] ?? [],
  };
}

export function lookupChartAccounts(input: {
  code?: string | null;
  query?: string | null;
  region: string;
}): { matches: ChartAccountMatch[]; region: string } {
  const region = normalizeRegion(input.region);
  const presets = STANDARD_CATEGORY_PRESETS[region] ?? [];
  const code = input.code?.trim().toLowerCase();
  const query = input.query?.trim().toLowerCase();

  const matches = presets
    .filter((preset) => {
      if (code) {
        return preset.code.toLowerCase() === code;
      }
      if (!query) {
        return true;
      }
      const haystack = [
        preset.code,
        preset.name,
        preset.account_number,
        preset.account_name,
        preset.llm_hint,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    })
    .map((preset) => ({ ...preset, region }));

  return { matches, region };
}

function applyPresetAccounts(
  current: ExpenseCategory,
  preset: CategoryPreset
): ExpenseCategory {
  return {
    ...current,
    account_class: current.account_class || preset.account_class || null,
    account_number: current.account_number || preset.account_number || null,
  };
}

function fromPreset(
  preset: CategoryPreset,
  sortOrder: number
): ExpenseCategory {
  return {
    account_class: preset.account_class ?? null,
    account_number: preset.account_number ?? null,
    code: preset.code,
    color: null,
    default_deduction_rate: preset.default_deduction_rate,
    is_tax_deductible: preset.is_tax_deductible,
    llm_hint: preset.llm_hint,
    name: preset.name,
    parent_code: null,
    sort_order: sortOrder,
  };
}

/**
 * Merge standard category presets into existing categories (avoids duplicates by code).
 * Fills missing Kontoklasse / account number on matching codes from the region pack.
 */
export function mergeStandardCategoriesForRegion(
  current: ExpenseCategory[],
  region: string
): ExpenseCategory[] {
  const presets = STANDARD_CATEGORY_PRESETS[normalizeRegion(region)] ?? [];
  if (presets.length === 0) {
    return current;
  }

  const next: ExpenseCategory[] = current.map((c) => ({ ...c }));
  const existingByCode = new Map(next.map((c, i) => [c.code, i]));

  for (const preset of presets) {
    const existingIndex = existingByCode.get(preset.code);
    if (existingIndex !== undefined) {
      next[existingIndex] = applyPresetAccounts(next[existingIndex], preset);
      continue;
    }
    next.push(fromPreset(preset, next.length));
  }

  return next;
}

export function mergeStandardTaxRatesForRegion(
  current: TaxRate[],
  region: string
): TaxRate[] {
  const presets = STANDARD_TAX_PRESETS[normalizeRegion(region)] ?? [];
  if (presets.length === 0) {
    return current;
  }

  const next: TaxRate[] = current.map((r) => ({ ...r }));
  const hadDefault = next.some((r) => r.is_default);

  for (const p of presets) {
    if (next.some((r) => r.value === p.value)) {
      continue;
    }
    next.push({
      label: p.label,
      name: p.name,
      value: p.value,
    });
  }

  if (!(hadDefault || next.some((r) => r.is_default))) {
    const firstPositive = next.find((r) => r.value > 0);
    if (firstPositive) {
      const idx = next.indexOf(firstPositive);
      next[idx] = { ...next[idx], is_default: true };
    }
  }

  return next;
}
