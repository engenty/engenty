export type CommercialBlockType =
  | "phase"
  | "headline"
  | "subheading"
  | "text"
  | "line_item";

/** Canonical line-item content — the shape the editor, PDF and totals read. */
export interface CommercialLineItemContent {
  amount: number;
  cost_per_item: number;
  tax: number;
  title: string;
  unit: string;
}

export type CommercialBlockContent =
  | { text: string }
  | CommercialLineItemContent
  | Record<string, unknown>;

export interface CommercialBlock {
  content: CommercialBlockContent | Record<string, unknown>;
  id: string;
  order_index: number;
  type: string;
}

export interface CommercialTotals {
  gross: number;
  net: number;
  tax: number;
}

// --- Mocks and legacy helpers ---
export const DEFAULT_LOCALE = "de-DE";

export function sanitizeHtml(html: string | undefined | null): string {
  if (!html) {
    return "";
  }
  return html.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    ""
  );
}

export function stripHtmlTags(html: string | undefined | null): string {
  if (!html) {
    return "";
  }
  return html.replace(/<[^>]*>?/gm, "");
}

export interface Unit {
  is_default?: boolean;
  label: string;
  singular?: string;
  value: string;
}

export interface TaxRate {
  is_default?: boolean;
  /** Human-readable description (Bezeichnung). */
  label: string;
  /** Short code / abbreviation (Kürzel). */
  name: string;
  value: number;
}

/** Label for selects and dropdowns (line items, default rate). */
export function getTaxRateOptionLabel(rate: TaxRate): string {
  if (rate.value === 0 && rate.name === "none") {
    return "0%";
  }
  const label = rate.label?.trim() || rate.name?.trim() || "";
  const code = rate.name?.trim() || "";
  if (label && code && label !== code) {
    return `${label} (${code}) — ${rate.value}%`;
  }
  if (label) {
    return `${label} — ${rate.value}%`;
  }
  return `${rate.value}%`;
}

/** Options for document-level default tax (dedupe by value; always include 0). */
export function buildDefaultTaxRateSelectOptions(
  taxRates: TaxRate[]
): TaxRate[] {
  const byValue = new Map<number, TaxRate>();
  for (const r of taxRates) {
    if (!byValue.has(r.value)) {
      byValue.set(r.value, r);
    }
  }
  if (!byValue.has(0)) {
    byValue.set(0, { name: "none", label: "0%", value: 0 });
  }
  return Array.from(byValue.values()).sort((a, b) => a.value - b.value);
}

export function getUnitDisplayLabel(
  units: Unit[],
  value: string,
  amount?: number
): string {
  const unit = units?.find((u) => u.value === value);
  if (!unit) {
    return value;
  }

  const singular = unit.singular?.trim() || "";
  const plural = unit.label?.trim() || "";

  // Keep these semantic units stable regardless of quantity.
  if (value === "text" || value === "fixed") {
    return singular || plural || unit.value || value;
  }

  if (amount === 1 && singular) {
    return singular;
  }

  return plural || singular || unit.value || value;
}

export function getUnitOptionLabel(unit: Unit): string {
  const singular = unit.singular?.trim() || "";
  const plural = unit.label?.trim() || "";
  if (singular && plural && singular !== plural) {
    return `${singular} / ${plural}`;
  }
  return plural || singular || unit.value;
}

export function formatCurrency(
  value: number,
  currency: string,
  locale: string = DEFAULT_LOCALE
): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    value
  );
}

export function formatNumber(
  value: number,
  locale: string,
  showCents = false
): string {
  const hasCents = Math.round(value * 100) % 100 !== 0;
  const minimumFractionDigits = hasCents || showCents ? 2 : 0;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(value);
}

export function formatCurrencyPrice(
  value: number,
  locale: string,
  currency: string
): string {
  const hasCents = Math.round(value * 100) % 100 !== 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return new Intl.NumberFormat(DEFAULT_LOCALE, {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(value);
  }
}
