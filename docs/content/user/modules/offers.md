---
title: Offers
description: Quotes and proposals — line items, phases, totals and status — and the agent operations the copilot uses to build them.
---

# Offers

An offer is a quote you send a client. It carries metadata (title, recipient,
validity, tax handling) and a body made of **blocks**: positions with quantity
and price, headlines, free text, and optional phases that group them.

Numbers, currency and tax rates come from
[Commercial settings](/docs/user/modules/commercial-settings); the printed layout
comes from [PDF templates](/docs/user/modules/pdf-templates).

Offers move `draft → ready → accepted`. Only a draft is meant to be edited
freely — a status change moves it out of the draft editor.

## Agent operations

These are the operations the copilot can run in this module. **Reads** never
change anything; **writes** do, and the ones that carry real consequence ask you
to approve them first.

| Operation | | What it does |
| --- | --- | --- |
| `offers_list` | Reads | List offers (status filter, search, pagination) |
| `offers_get` | Reads | Get offer by ID or offer number |
| `offers_get_blocks` | Reads | Get the content blocks (positions, phases, text) |
| `offers_get_next_number` | Reads | Preview the next offer number |
| `offers_settings_get` | Reads | Get module settings (number format, defaults, validity days) |
| `offers_create` | Writes | Create an offer (a title is enough; defaults fill the rest) |
| `offers_update` | Writes | Update fields (metadata, intro/notes, display toggles) |
| `offers_update_blocks` | Writes | Edit individual blocks by id |
| `offers_replace_blocks` | Writes | Replace all content blocks at once |
| `offers_set_status` | Writes | Move status along draft → ready → accepted |
| `offers_settings_set` | Writes | Update module settings |
| `offers_delete` | Writes | Delete an offer (irreversible) |

If you have the offer open in the editor while the copilot works on it, the
changes appear live. Unsaved edits of your own are kept — you will see a notice
rather than losing them.
