import type { TaxRate } from "@engenty/commercial-editor";

/** Normalize tenant `tax_rates` JSON for the commercial editor and offer settings UI. */
export function normalizeCommercialTaxRates(raw: unknown): TaxRate[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: TaxRate[] = [];
  for (const entry of raw) {
    const e = entry as Record<string, unknown>;
    const name = typeof e.name === "string" ? e.name.trim() : "";
    const value = Number(e.value);
    if (!(name && Number.isFinite(value))) {
      continue;
    }
    const labelRaw = typeof e.label === "string" ? e.label.trim() : "";
    const label = labelRaw || name;
    out.push({
      name,
      label,
      value,
      is_default: e.is_default === true,
    });
  }
  let seenDefault = false;
  return out.map((r) => {
    if (r.is_default) {
      if (seenDefault) {
        return { ...r, is_default: false };
      }
      seenDefault = true;
    }
    return r;
  });
}

export function resolveDefaultTaxRateFromCommercial(
  taxRates: TaxRate[] | null | undefined
): number {
  const rates = taxRates ?? [];
  const marked = rates.find((r) => r.is_default);
  if (marked && Number.isFinite(marked.value)) {
    return marked.value;
  }
  const firstPositive = rates.find((r) => r.value > 0);
  if (firstPositive) {
    return firstPositive.value;
  }
  return 20;
}
