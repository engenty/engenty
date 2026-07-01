---
name: contacts-enrichment
title: Contacts enrichment
description: Enrich an existing organisation contact from public sources, then summarize field suggestions for review.
allowed-tools: engenty_tools_search engenty_tool_execute web_search
---

# Contacts Enrichment

Use this skill when enriching an existing organisation contact from public data, especially from the contact detail copilot or the `contacts.enhance-contact` workflow.

## Target And Baseline

1. Treat the current scoped contact as the default target when the runtime context includes `scope.entityId`.
2. If there is no scoped contact, use `contacts_contact_search` to resolve the target. Ask for one clarification when the target is ambiguous.
3. Load the current record with `contacts_get` through `engenty_tool_execute` before proposing changes.
4. Do not enrich person-only records with organisation-specific legal or tax fields.

## Evidence Process

- Check all relevant field groups before summarizing: company main info, address, legal and registration, and tax.
- Prefer official and registry sources, then company-controlled sources such as the official website or impressum pages, then broader web context.
- Use `web_search` for official websites, registry and public context, news, leadership, or first-party legal pages, including Austrian organisations when you have a company name, legal name, VAT id, or website URL.
- If sources diverge, prefer the source that is clearly newer only when the evidence shows freshness. Otherwise ask the user to choose.

## Suggestions

- Convert concrete field changes into clear suggestion summaries with schema-real field names and evidence.
- Do not call `contacts_update` during enrichment unless the user explicitly asked for a catalog-backed write.
- Briefly summarize proposed changes and remind the user that values are draft until they save the form.

## Field Notes

- Use `address_info` for the additional address field.
- Use `vat_id` for VAT/UID values and `tax_id` only for separate tax identifiers.
- Keep `website_contact` and `website_impress` distinct when both are known.
- When multiple registry candidates match, publish candidates or ask the user to choose instead of guessing.
