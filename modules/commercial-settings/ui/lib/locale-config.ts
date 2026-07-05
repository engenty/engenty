/** Built-in "No Tax" rate (non-deletable; not stored in `tax_rates` JSON). */
export const BUILT_IN_NO_TAX = { label: "None", name: "none", value: 0 };

/** Built-in units (non-deletable). */
export const BUILT_IN_UNITS = [
  { name: "text", label: "Text" },
  { name: "fixed", label: "Pauschal" },
  { name: "h", label: "Stunden", singular: "Stunde" },
  { name: "d", label: "Tage", singular: "Tag" },
];

export interface LocaleOption {
  currency: string;
  labelDe: string;
  labelEn: string;
  value: string;
}

export const LOCALE_OPTIONS: LocaleOption[] = [
  {
    value: "de-AT",
    labelDe: "Österreich (Deutsch)",
    labelEn: "Austria (German)",
    currency: "EUR",
  },
  {
    value: "de-DE",
    labelDe: "Deutschland (Deutsch)",
    labelEn: "Germany (German)",
    currency: "EUR",
  },
  {
    value: "de-CH",
    labelDe: "Schweiz (Deutsch)",
    labelEn: "Switzerland (German)",
    currency: "CHF",
  },
  {
    value: "en-GB",
    labelDe: "Großbritannien (Englisch)",
    labelEn: "United Kingdom (English)",
    currency: "GBP",
  },
  {
    value: "en-US",
    labelDe: "USA (Englisch)",
    labelEn: "United States (English)",
    currency: "USD",
  },
];

export const NUMBER_FORMAT_OPTIONS = [
  { value: "de-DE", formatLabel: "1.234,56" },
  { value: "de-AT", formatLabel: "1.234,56" },
  { value: "en-US", formatLabel: "1,234.56" },
  { value: "en-GB", formatLabel: "1,234.56" },
  { value: "fr-FR", formatLabel: "1 234,56" },
];

export function getRegionFromLocale(locale: string): string {
  const parts = locale.split("-");
  return parts[1] ?? parts[0] ?? "";
}

const CURRENCY_BY_REGION: Record<string, { code: string; symbol: string }> = {
  AT: { code: "EUR", symbol: "€" },
  DE: { code: "EUR", symbol: "€" },
  CH: { code: "CHF", symbol: "CHF" },
  GB: { code: "GBP", symbol: "£" },
  US: { code: "USD", symbol: "$" },
};

export function getCurrencyFromLocale(locale: string): {
  code: string;
  symbol: string;
} {
  const region = getRegionFromLocale(locale);
  return CURRENCY_BY_REGION[region] ?? { code: "EUR", symbol: "€" };
}

export function getLocaleLabel(opt: LocaleOption, lang: string): string {
  return lang === "de" ? opt.labelDe : opt.labelEn;
}
