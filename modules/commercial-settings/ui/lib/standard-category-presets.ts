import type { ExpenseCategory } from "../api.js";

type CategoryPreset = Pick<
  ExpenseCategory,
  "code" | "name" | "is_tax_deductible" | "default_deduction_rate" | "llm_hint"
>;

/**
 * Standard expense category presets keyed by ISO 3166-1 alpha-2 region.
 *
 * AT: Based on Austrian EStG and standard accounting practice (SKR 07 / EA-Rechnung).
 * Deduction rates reflect Austrian tax law defaults:
 * - Bewirtung: 50% absetzbar (§ 20 Abs 1 Z 3 EStG)
 * - Kfz-Kosten: 100% wenn betrieblich, Privatanteil separat kürzen
 * - Geschenke: begrenzt absetzbar (Werbecharakter → 100%, rein repräsentativ → 0%)
 */
export const STANDARD_CATEGORY_PRESETS: Record<string, CategoryPreset[]> = {
  AT: [
    {
      code: "reise",
      name: "Reisekosten",
      is_tax_deductible: true,
      default_deduction_rate: 1,
      llm_hint:
        "Flüge, Bahn, Hotel, Tagegeld, Diäten, Km-Geld, Taxi, Mietwagen",
    },
    {
      code: "bewirtung",
      name: "Bewirtung & Repräsentation",
      is_tax_deductible: true,
      default_deduction_rate: 0.5,
      llm_hint:
        "Geschäftsessen, Restaurant, Catering, Kundenessen — 50% absetzbar in AT",
    },
    {
      code: "buero",
      name: "Büromaterial & Verbrauchsmaterial",
      is_tax_deductible: true,
      default_deduction_rate: 1,
      llm_hint: "Papier, Toner, Stifte, Druckerpatronen, Reinigungsmittel",
    },
    {
      code: "miete",
      name: "Miete & Betriebskosten",
      is_tax_deductible: true,
      default_deduction_rate: 1,
      llm_hint:
        "Büromiete, Nebenkosten, Strom, Heizung, Wasser, Müllentsorgung",
    },
    {
      code: "telekom",
      name: "Telefon, Internet & Kommunikation",
      is_tax_deductible: true,
      default_deduction_rate: 1,
      llm_hint: "Handyvertrag, Festnetz, Internet, Mobilfunk, Hosting, Domain",
    },
    {
      code: "porto",
      name: "Porto & Versand",
      is_tax_deductible: true,
      default_deduction_rate: 1,
      llm_hint: "Briefmarken, Paketversand, Kurier, DHL, Post",
    },
    {
      code: "literatur",
      name: "Fachliteratur & Zeitschriften",
      is_tax_deductible: true,
      default_deduction_rate: 1,
      llm_hint: "Fachbücher, Zeitschriften-Abo, Online-Zugang, Newsletter-Abo",
    },
    {
      code: "fortbildung",
      name: "Aus- und Fortbildung",
      is_tax_deductible: true,
      default_deduction_rate: 1,
      llm_hint:
        "Seminare, Kurse, Konferenzen, Workshops, Zertifizierungen, Prüfungsgebühren",
    },
    {
      code: "versicherung",
      name: "Versicherungen",
      is_tax_deductible: true,
      default_deduction_rate: 1,
      llm_hint:
        "Betriebshaftpflicht, Berufshaftpflicht, Elektronikversicherung, Rechtsschutz",
    },
    {
      code: "kfz",
      name: "Kfz-Kosten",
      is_tax_deductible: true,
      default_deduction_rate: 1,
      llm_hint:
        "Treibstoff, Tankrechnung, Service, Reparatur, Vignette, Maut, Parkgebühren, Leasing",
    },
    {
      code: "werbung",
      name: "Werbung & Marketing",
      is_tax_deductible: true,
      default_deduction_rate: 1,
      llm_hint:
        "Anzeigen, Google Ads, Social Media, Flyer, Druckkosten, Messestand, Sponsoring",
    },
    {
      code: "beratung",
      name: "Beratung & Fremdleistungen",
      is_tax_deductible: true,
      default_deduction_rate: 1,
      llm_hint:
        "Steuerberater, Rechtsanwalt, Unternehmensberatung, Freelancer, Subunternehmer",
    },
    {
      code: "software",
      name: "Software, Lizenzen & IT",
      is_tax_deductible: true,
      default_deduction_rate: 1,
      llm_hint:
        "SaaS-Abos, Cloud, Microsoft 365, Adobe, Antivirus, Server, Backup",
    },
    {
      code: "ausstattung",
      name: "Büroeinrichtung & Geräte",
      is_tax_deductible: true,
      default_deduction_rate: 1,
      llm_hint:
        "Möbel, Monitor, Laptop, Tastatur, Drucker — GWG bis 1.000 € sofort absetzbar",
    },
    {
      code: "bank",
      name: "Bank- & Zahlungsgebühren",
      is_tax_deductible: true,
      default_deduction_rate: 1,
      llm_hint:
        "Kontogebühren, Überweisungsgebühren, Kreditkartengebühren, PayPal-Gebühren",
    },
    {
      code: "mitglied",
      name: "Mitgliedsbeiträge & Verbände",
      is_tax_deductible: true,
      default_deduction_rate: 1,
      llm_hint: "WKO, Berufsverband, Kammer, Verein, Fachverband",
    },
    {
      code: "geschenke",
      name: "Geschenke & Kundengeschenke",
      is_tax_deductible: true,
      default_deduction_rate: 1,
      llm_hint:
        "Werbegeschenke mit Logo 100% absetzbar, rein repräsentative Geschenke nicht",
    },
    {
      code: "reparatur",
      name: "Reparaturen & Instandhaltung",
      is_tax_deductible: true,
      default_deduction_rate: 1,
      llm_hint: "Gerätereparatur, Büroreparatur, Wartungsvertrag, Handwerker",
    },
    {
      code: "sonstige",
      name: "Sonstige betriebliche Aufwendungen",
      is_tax_deductible: true,
      default_deduction_rate: 1,
      llm_hint:
        "Alles, was in keine andere Kategorie passt — Fallback-Kategorie",
    },
  ],
  DE: [
    {
      code: "reise",
      name: "Reisekosten",
      is_tax_deductible: true,
      default_deduction_rate: 1,
      llm_hint: "Fahrtkosten, Hotel, Verpflegungspauschale, Bahnticket",
    },
    {
      code: "bewirtung",
      name: "Bewirtung",
      is_tax_deductible: true,
      default_deduction_rate: 0.7,
      llm_hint: "Geschäftsessen — 70% absetzbar in DE",
    },
    {
      code: "buero",
      name: "Bürobedarf",
      is_tax_deductible: true,
      default_deduction_rate: 1,
      llm_hint: "Büromaterial, Papier, Toner",
    },
    {
      code: "miete",
      name: "Miete & Nebenkosten",
      is_tax_deductible: true,
      default_deduction_rate: 1,
      llm_hint: "Büromiete, Strom, Heizung, Nebenkosten",
    },
    {
      code: "telekom",
      name: "Telekommunikation",
      is_tax_deductible: true,
      default_deduction_rate: 1,
      llm_hint: "Telefon, Internet, Mobilfunk",
    },
    {
      code: "software",
      name: "Software & Lizenzen",
      is_tax_deductible: true,
      default_deduction_rate: 1,
      llm_hint: "SaaS, Cloud, Lizenzen",
    },
    {
      code: "beratung",
      name: "Beratung & Fremdleistungen",
      is_tax_deductible: true,
      default_deduction_rate: 1,
      llm_hint: "Steuerberater, Anwalt, Freelancer",
    },
    {
      code: "versicherung",
      name: "Versicherungen",
      is_tax_deductible: true,
      default_deduction_rate: 1,
      llm_hint: "Betriebshaftpflicht, Berufshaftpflicht",
    },
    {
      code: "kfz",
      name: "Kfz-Kosten",
      is_tax_deductible: true,
      default_deduction_rate: 1,
      llm_hint: "Treibstoff, Wartung, Leasing, Versicherung",
    },
    {
      code: "sonstige",
      name: "Sonstige betriebliche Aufwendungen",
      is_tax_deductible: true,
      default_deduction_rate: 1,
      llm_hint: "Fallback-Kategorie",
    },
  ],
  CH: [
    {
      code: "reise",
      name: "Reisespesen",
      is_tax_deductible: true,
      default_deduction_rate: 1,
      llm_hint: "Reisekosten, Bahn, Flug, Hotel",
    },
    {
      code: "verpflegung",
      name: "Verpflegung & Repräsentation",
      is_tax_deductible: true,
      default_deduction_rate: 1,
      llm_hint: "Geschäftsessen, Verpflegungskosten",
    },
    {
      code: "buero",
      name: "Büromaterial",
      is_tax_deductible: true,
      default_deduction_rate: 1,
      llm_hint: "Bürobedarf, Verbrauchsmaterial",
    },
    {
      code: "miete",
      name: "Miete & Nebenkosten",
      is_tax_deductible: true,
      default_deduction_rate: 1,
      llm_hint: "Büromiete, Nebenkosten",
    },
    {
      code: "software",
      name: "Software & IT",
      is_tax_deductible: true,
      default_deduction_rate: 1,
      llm_hint: "SaaS, Lizenzen, IT-Kosten",
    },
    {
      code: "sonstige",
      name: "Übriger Aufwand",
      is_tax_deductible: true,
      default_deduction_rate: 1,
      llm_hint: "Sonstige geschäftliche Ausgaben",
    },
  ],
};

/**
 * Merge standard category presets into existing categories (avoids duplicates by code).
 * Analogous to `mergeStandardTaxRatesForRegion`.
 */
export function mergeStandardCategoriesForRegion(
  current: ExpenseCategory[],
  region: string
): ExpenseCategory[] {
  const presets = STANDARD_CATEGORY_PRESETS[region] ?? [];
  if (presets.length === 0) {
    return current;
  }

  const next: ExpenseCategory[] = current.map((c) => ({ ...c }));
  const existingCodes = new Set(next.map((c) => c.code));

  for (const p of presets) {
    if (existingCodes.has(p.code)) {
      continue;
    }
    next.push({
      ...p,
      color: null,
      parent_code: null,
      sort_order: next.length,
    });
  }

  return next;
}
