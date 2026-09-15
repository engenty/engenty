---
name: commercial-tax-rates
title: Tax rates and deduction rules
description: Maintain tenant VAT/USt rates and per-category tax deduction rules. Seed standard rates from a region pack without overwriting an existing default.
allowed-tools: loadCommercialSettings mergeTaxRatesFromRegion setCommercialCollection loadRegionPack engenty_tools_search engenty_tool_execute navigate
---

# Tax rates and deduction rules

Use this skill when the user asks about VAT, USt, MwSt, tax rates, the
standard rate, or category deduction rules. Currency belongs to
`commercial-settings`. Expense category deductibility percentages on the
category row belong to `commercial-expense-categories`.

## Tax rates

1. `loadCommercialSettings` — read `tax_rates` and `no_tax_reason`.
2. Seed with `mergeTaxRatesFromRegion` (`dry_run` first). It appends missing
   **values** and will not overwrite an existing `is_default`.
3. Hand edits: full replace via `setCommercialCollection`
   `{ collection: "tax_rates", tax_rates: [...] }` or
   `commercial_settings_tax_rates_set` (approval).

Rules:

- Abbreviations (`name`) are unique (case-insensitive).
- At most one `is_default: true`.
- Built-in 0% "none" is not stored in `tax_rates` — do not add a 0% row to
  mimic it.
- Values are percents (`20`, not `0.20`).

Typical packs: AT 20/10/13, DE 19/7, CH 8.1/2.6, GB 20/5. US has no pack.

## Deduction rules

`tax_deduction_rules` is a separate list (`category_code`, `rate` 0–1,
optional `description`). Replace via
`{ collection: "tax_deduction_rules", tax_deduction_rules: [...] }` or
`commercial_settings_tax_deduction_rules_set` (approval). Prefer the
`default_deduction_rate` on the category when that is what the user means.

## Never

- Invent a rate the region does not use.
- Mark two rates as default.
- Replace the list with only the new rate.
