---
name: commercial-disciplines-and-units
title: Disciplines and units
description: Maintain billing disciplines (name, short code, hourly rate) and commercial units used on offers, invoices, projects, and time tracking.
allowed-tools: loadCommercialSettings setCommercialCollection engenty_tools_search engenty_tool_execute navigate
---

# Disciplines and units

Use this skill when the user asks about hourly rates, disciplines, or units
(hours, days, lumpsum). Tax and expense categories are other skills.

These lists are catalog data (no approval gate) but still **full replaces**.
Read first.

## Disciplines

`{ name, short, rate }` — `rate` is the default hourly rate. Time tracking
and project tasks use the same `name` / `short` so hours land on the buckets
you price on offers.

`setCommercialCollection` with
`{ collection: "disciplines", disciplines: [...] }` or
`commercial_settings_disciplines_set`.

Do not invent a rate. If the user did not say the number, ask.

## Units

`{ name, label, singular? }`. Built-in keys `text`, `fixed`, `h`, `d` are
product defaults — do not delete them unless the user explicitly wants that.

`{ collection: "units", units: [...] }` or `commercial_settings_units_set`.

## After writes

`navigate` to `/settings/commercial`.
