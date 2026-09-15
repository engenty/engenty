---
name: commercial-settings
title: Commercial defaults
description: Read and update tenant commercial defaults — currency, locales, and the shared lists that price offers, invoices, and time tracking.
allowed-tools: loadCommercialSettings setCommercialDefaults setCommercialCollection listRegionPacks engenty_tools_search engenty_tool_execute navigate
---

# Commercial defaults

Use this skill when the user asks about currency, locale, number format, or
"our commercial settings" as a whole. For charts of accounts and Kontoklasse,
use `commercial-charts`. For seeding or editing expense categories, use
`commercial-expense-categories`. For VAT/USt lists, use `commercial-tax-rates`.
For hourly rates and units, use `commercial-disciplines-and-units`.

This is one **tenant-shared** book. A Space mount grants access; there is no
`space_id`. Never invent one.

## Tool process

1. `loadCommercialSettings` — always first. The stored row is the source of
   truth after any earlier merge.
2. Scalar changes (currency, `currency_symbol`, `default_locale`,
   `number_locale`, `no_tax_reason`) go through `setCommercialDefaults`.
   Partial merge: omit a field to leave it, pass `null` to clear it. Currency
   requires approval.
3. Collection changes go through `setCommercialCollection` **or** a merge
   tool. Each collection write **replaces that list entirely**. Read first,
   send every row you are keeping.
4. Catalog fallback: `engenty_tools_search` with `moduleId: "commercial-settings"`
   then `engenty_tool_execute` for `commercial_settings_get` /
   `commercial_settings_defaults_set` / `commercial_settings_*_set`.
5. `navigate` to `/settings/commercial` after writes.

## Locale and currency

`default_locale` values in this product: `de-AT`, `de-DE`, `de-CH`, `en-GB`,
`en-US`. Changing locale does **not** rewrite tax or categories — offer to
merge the matching region pack afterwards.

| Locale | Region | Currency |
|--------|--------|----------|
| de-AT | AT | EUR |
| de-DE | DE | EUR |
| de-CH | CH | CHF |
| en-GB | GB | GBP |
| en-US | US | USD |

## Catalog operations

| Goal | Operation |
|------|-----------|
| Read everything | `commercial_settings_get` |
| Currency / locales | `commercial_settings_defaults_set` (approval) |
| List region packs | `commercial_settings_region_packs_list` |
| Load one pack | `commercial_settings_region_pack_get` |
