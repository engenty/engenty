import type { TaxRate } from "../api.js";

/** Presets keyed by ISO 3166-1 alpha-2 region (matches `getRegionFromLocale`). */
export const STANDARD_TAX_PRESETS: Record<
  string,
  Pick<TaxRate, "name" | "label" | "value">[]
> = {
  AT: [
    { name: "USt", label: "Umsatzsteuer (Normal)", value: 20 },
    { name: "USt_erm", label: "Ermäßigt", value: 10 },
    { name: "USt_bes", label: "Besonders", value: 13 },
  ],
  CH: [
    { name: "MWST", label: "Normalsatz", value: 8.1 },
    { name: "MWST_red", label: "Reduziert", value: 2.6 },
    { name: "MWST_hotel", label: "Beherbergung", value: 3.8 },
  ],
  DE: [
    { name: "MwSt", label: "Mehrwertsteuer (Normal)", value: 19 },
    { name: "MwSt_erm", label: "Ermäßigt", value: 7 },
  ],
  GB: [
    { name: "VAT", label: "Standard", value: 20 },
    { name: "VAT_red", label: "Reduced", value: 5 },
  ],
  US: [],
};

export function mergeStandardTaxRatesForRegion(
  current: TaxRate[],
  region: string
): TaxRate[] {
  const presets = STANDARD_TAX_PRESETS[region] ?? [];
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
