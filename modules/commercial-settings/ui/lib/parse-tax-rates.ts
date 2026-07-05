import type { TaxRate } from "../api.js";

/** Normalize rows from API for form state (label required for PATCH; rows may omit label until saved). */
export function parseTaxRatesFromApi(raw: unknown): TaxRate[] {
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
