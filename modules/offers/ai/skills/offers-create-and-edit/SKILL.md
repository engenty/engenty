---
name: offers-create-and-edit
title: Create and edit offers
description: Create new offers and edit metadata — title, billing type, dates, tax settings, reference, and status transitions.
allowed-tools: engenty_tools_search engenty_tool_execute navigate
---

# Create and Edit Offers

Use this skill when the user wants to create a new offer or change offer metadata fields.

## Tool Process

1. Use `engenty_tools_search` with `moduleId: "offers"` to find operations.
2. Prefer: `offers_create`, `offers_update`, `offers_get_next_number`.

All writes go through backend operations. When the user has the offer open in
the editor, changes appear there live (realtime) — no separate in-page tool.

## Creating an Offer

Before creating, check if a similar offer already exists with `offers_list` and a `search` query.

Use `offers_create` with at minimum `{ title: "..." }`. Optional fields at creation:
- `billing_type`: `"fixed_price"` | `"time_and_materials"` | `"retainer"` | `"recurring"` (default: `"fixed_price"`)
- `billing_interval`: `"monthly"` | `"quarterly"` | `"yearly"` (for retainer/recurring only)
- `offer_date`: ISO date string (defaults to today)
- `valid_until`: ISO date string (defaults to 30 days from offer_date)
- `reference`: customer reference string
- `currency`: ISO currency code (default: `"EUR"`)
- `client_id`: contact ID if linking to a contact record
- `recipient_name`, `recipient_email`, `recipient_address`: recipient info if no contact linked

The `offer_number` is auto-generated. To show the user what the next number will be, call `offers_get_next_number` first.

After creating, navigate to the new offer with the `navigate` tool: `/mdl/offers/<id>/draft`.

## Editing an Offer

Use `offers_update` with `{ id: "<offer-id>", patch: { ... } }`. Put only the fields that should change inside `patch`.

Patchable fields: `title`, `billing_type`, `billing_interval`, `offer_date`, `valid_until`, `reference`, `currency`, `default_tax_rate`, `no_tax_reason`, `introduction`, `final_notes`, `phases_enabled`, `show_phase_index`, `show_phase_totals`, `show_tax_per_item`, recipient fields, and `client_id`. For status changes use `offers_set_status` instead.

Edits persist immediately. If the user has the offer open in the editor, they see the change live; if they have unsaved local edits, the editor shows them a conflict banner — mention that their unsaved changes are preserved.

**Act directly on drafts.** When the user asks for content ("write an
introduction", "add final notes", "change the title"), write it into the
offer with `offers_update` in the same turn — do NOT paste the drafted text
into chat and ask "should I write this into the field?". The offer is a
draft: writes are low-risk, the approval prompt (when configured) is the
safety gate, and the user watches the result appear live in the editor.
Asking first just doubles the round-trips. Only ask when the request itself
is ambiguous (e.g. which of several offers to edit).

## Status Transitions

| From | To | Meaning |
|------|----|---------|
| `draft` | `ready` | Mark as ready — offer is finalized |
| `ready` | `accepted` | Mark as accepted — client agreed |

Use `offers_set_status` with `{ id: "<id>", status: "ready" }` or `{ status: "accepted" }`.

Status transitions always go through `offers_set_status` — a status change moves the offer out of the draft editor.

## Module Settings

Read the offers module settings with `offers_settings_get`: number format
(`offer_id_prefix` — supports `{year}` —, `offer_id_offset`,
`offer_id_postfix`), `default_intro`, `default_final_notes`, and
`valid_until_days`. Update them with `offers_settings_set` (partial patch,
approval-gated). Changing the number format only affects future offers.

## Safety Rules

- Confirm before any status transition.
- Confirm before multi-field writes that weren't all explicitly requested.
- Never delete an offer using this skill; if the user asks to delete, warn that it is irreversible and require explicit confirmation before running `offers_delete`.
