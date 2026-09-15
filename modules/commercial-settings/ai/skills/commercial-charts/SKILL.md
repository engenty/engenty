---
name: commercial-charts
title: Regional charts of accounts
description: Map expense categories to Kontoklasse and account numbers using the module region packs (Austrian EKR, German SKR 03, Swiss KMU). Use when seeding or looking up commercial expense accounts.
allowed-tools: listRegionPacks loadRegionPack lookupChartAccount loadCommercialSettings mergeExpenseCategoriesFromRegion engenty_tools_search engenty_tool_execute
---

# Regional charts of accounts

Expense categories in commercial settings carry an optional **Kontoklasse**
(`account_class`, one digit) and **Konto** (`account_number`). Defaults come
from region packs in this module, not from a live accounting system.

## Source of truth

1. **Tenant list first.** `loadCommercialSettings` — if categories already
   exist, edit that list. Do not replace it with a pack unless the user asked
   to reset or fill missing accounts.
2. **Packs** via `listRegionPacks` / `loadRegionPack` / `lookupChartAccount`
   (same data as `modules/commercial-settings/data/<ISO-3166-1-alpha-2>/`).
   Catalog equivalents: `commercial_settings_region_packs_list`,
   `commercial_settings_region_pack_get`, `commercial_settings_chart_lookup`.

| Region | Chart | Expense class |
|--------|--------|----------------|
| AT | Einheitskontenrahmen (KFS/BW 6) | **7** (class 4 is Erlöse — never 4400) |
| DE | DATEV SKR 03 | **4** (SKR 04 uses class 6 instead) |
| CH | KMU-Kontenrahmen | **6** (class 4 is Ertrag) |
| GB | tax rates only | — |

Skill `references/` copies the region `chart.md` notes (`at-ekr.md`,
`de-skr03.md`, `ch-kmu.md`) so they load with this skill.

Austria is EKR, not German SKR. Official 3-digit accounts; this pack stores a
4-digit starter (`734` → `7340`).

## Lookup

`lookupChartAccount` with `{ region: "AT", code: "reise" }` or
`{ region: "AT", query: "taxi" }`. Do not invent numbers when the pack has a
row. If several matches, list them and ask.

## Seed missing accounts

`mergeExpenseCategoriesFromRegion` with `dry_run: true` first. It adds missing
codes and backfills empty class/account; it will not overwrite a filled
Konto or a custom name.

Locale on the settings row (`default_locale`, e.g. `de-AT`) picks the region
when the user does not name one.

## Austrian EKR (default for `de-AT`)

| code | Klasse | Konto | EKR |
|------|--------|-------|-----|
| reise | 7 | 7340 | Reise- und Fahrtaufwand |
| bewirtung | 7 | 7650 | Werbung und Repräsentation (50 % EStG) |
| buero | 7 | 7600 | Büromaterial |
| miete | 7 | 7400 | Miete/Pacht (energy of rented rooms → 7200) |
| telekom | 7 | 7380 | Nachrichtenaufwand |
| porto | 7 | 7381 | Nachrichtenaufwand (Porto) |
| literatur | 7 | 7630 | Fachliteratur |
| fortbildung | 7 | 7770 | Aus- und Fortbildung |
| versicherung | 7 | 7700 | Versicherungen |
| kfz | 7 | 7320 | Kfz-Aufwand PKW |
| werbung | 7 | 7660 | Werbung |
| beratung | 7 | 7750 | Beratung und Prüfung |
| software | 7 | 7480 | Lizenzaufwand |
| ausstattung | 7 | 7060 | GWG Sofortabschreibung |
| bank | 7 | 7790 | Spesen des Geldverkehrs |
| mitglied | 7 | 7780 | Mitgliedsbeiträge |
| geschenke | 7 | 7670 | Werbegeschenke |
| reparatur | 7 | 7200 | Instandhaltung |
| sonstige | 7 | 7840 | Verschiedene betriebliche Aufwendungen |

Full notes: `data/AT/chart.md` and this skill's `references/at-ekr.md`.
Do not invent SKR 03 numbers for an Austrian space.
