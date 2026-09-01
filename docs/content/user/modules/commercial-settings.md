---
title: Commercial settings
description: Currency, tax rates, units, disciplines and expense categories shared by offers, invoices, projects and time tracking — and the agent operations that maintain them.
---

# Commercial settings

The shared commercial ground every document stands on: your currency and number
format, the tax rates that may be applied, the units positions are measured in,
the disciplines you bill by (with their hourly rates), and the expense
categories used for bookkeeping. Time tracking and project tasks use the same
discipline list — names and short codes — so hours land on the same buckets you
price on offers.

Change something here and it applies to everything written afterwards. Existing
offers and invoices keep the values they were written with.

Find it at **Settings → Commercial**.

## Agent operations

These are the operations the copilot can run in this module. **Reads** never
change anything; **writes** do, and the ones that carry real consequence ask you
to approve them first.

Each list has its own operation, and each one **replaces that list entirely** —
so when you ask for something to be added, the copilot reads the current list
first and sends it back with the new entry included. Nothing it writes can touch
a list it was not asked about.

| Operation | | What it does |
| --- | --- | --- |
| `commercial_settings_get` | Reads | Read all commercial defaults |
| `commercial_settings_disciplines_set` | Writes | Replace the discipline list (name, short code, hourly rate) |
| `commercial_settings_units_set` | Writes | Replace the unit list (name, label, singular) |
| `commercial_settings_tax_rates_set` | Writes | Replace the tax rate list — approval required |
| `commercial_settings_expense_categories_set` | Writes | Replace expense categories, including deductibility — approval required |
| `commercial_settings_tax_deduction_rules_set` | Writes | Replace the tax deduction rules — approval required |
| `commercial_settings_defaults_set` | Writes | Update currency, symbol, locales, no-tax reason — approval required |

The four approval-gated operations are the ones that price things: get a tax
rate or the currency wrong and every document written afterwards is wrong with
it. Disciplines and units are catalog data and change without a prompt.

If you have this page open while the copilot edits it, the values update in
front of you.
