import type { TaxRate } from "@engenty/commercial-editor";

/** Normalize tenant `tax_rates` JSON for the commercial editor / invoice settings UI. */
export function normalizeInvoiceTaxRates(raw: unknown): TaxRate[] {
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
    out.push({
      name,
      label: labelRaw || name,
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
