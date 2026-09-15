# Commercial region packs

Reference data for **tax rates**, **expense categories**, and **charts of
accounts**. Software loads the JSON. Agents can read the same files plus the
markdown notes.

```text
data/<ISO-3166-1-alpha-2>/
  chart.json                 chart metadata + Kontenklassen
  chart.md                   human/AI notes (how the chart maps to expenses)
  expense-categories.json    standard categories with default class + account
  expense-categories.csv     same rows, spreadsheet-friendly
  tax-rates.json             standard VAT / USt rates
```

| Region | Chart | Standard |
|--------|--------|----------|
| `AT` | Österreichischer Einheitskontenrahmen | KFS/BW 6 (2017) |
| `DE` | SKR 03 (DATEV, IKR-nah) | DATEV SKR 03 |
| `CH` | KMU-Kontenrahmen | Swiss KMU 2013 |
| `GB` | — (tax rates only) | UK VAT |

The official AT text is **KFS/BW 6** from the Kammer der Steuerberater und
Wirtschaftsprüfer. This pack does **not** redistribute that PDF. It records the
public class/group structure and a 4-digit starter plan (3-digit EKR account +
trailing `0`), which KFS/BW 6 explicitly allows companies to extend.

Tenant settings stay the source of truth after the user (or an agent) merges a
pack via **Standard categories (region)** / `mergeExpenseCategoriesFromRegion`
/ `commercial_settings_expense_categories_set`.
The files here are defaults, not live books.

Agents also have catalog operations `commercial_settings_region_packs_list`,
`commercial_settings_region_pack_get`, and `commercial_settings_chart_lookup`.
