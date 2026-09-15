---
name: commercial-expense-categories
title: Expense categories
description: Seed, merge, and edit tenant expense categories including deductibility, Kontoklasse, and account numbers from the regional chart of accounts.
allowed-tools: loadCommercialSettings lookupChartAccount mergeExpenseCategoriesFromRegion setCommercialCollection loadRegionPack engenty_tools_search engenty_tool_execute navigate
---

# Expense categories

Use this skill to add, correct, or seed expense categories. For chart theory
and region differences, use `commercial-charts`.

## Tool process

1. `loadCommercialSettings` — the `expense_categories` array is the tenant
   list. Codes are unique.
2. To fill from a chart pack: `mergeExpenseCategoriesFromRegion` with
   `dry_run: true`, show added codes and backfilled accounts, then run
   without `dry_run` after the user confirms. Region from `default_locale`
   when omitted.
3. To edit by hand: copy the current list, change the rows, send the **full**
   list via `setCommercialCollection` with
   `{ collection: "expense_categories", expense_categories: [...] }`.
   Catalog: `commercial_settings_expense_categories_set` (approval).
4. `navigate` to `/settings/commercial` after a write.

## Row shape

`code`, `name`, `is_tax_deductible`, `default_deduction_rate` (0–1),
`account_class` (one digit), `account_number`, optional `llm_hint`, `color`,
`parent_code`, `sort_order`.

`llm_hint` is what classifiers read — keep it a short list of receipt
keywords, not a paragraph.

## Deductibility

Do not change `default_deduction_rate` without a regional reason. Pack
defaults: AT Bewirtung **50%**, DE Bewirtung **70%**. Confirm with the user
before changing a rate that already exists.

## Never

- Send a one-row replace unless the user asked to wipe the list.
- Invent account numbers. Look them up, or leave class/account empty.
- Use class 4 on Austrian expenses (Erlöse). AT Aufwand is class 7.
