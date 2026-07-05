---
name: offers-blocks-management
title: Offer blocks management
description: Add, edit, and replace content blocks (line items, phases, headings, text) within an offer.
allowed-tools: engenty_tools_search engenty_tool_execute
---

# Offer Blocks Management

Use this skill when the user wants to add, edit, reorder, or remove content blocks inside an offer — line items, phases, headings, and text sections.

## Block Types

| type | Purpose | `content_json` fields (canonical) |
|------|---------|-----------------------------------|
| `line_item` | Billable position | `title` (string), `amount` (number — the quantity), `unit` (string, e.g. `"h"`, `"Tage"`, `"fixed"`), `cost_per_item` (number — net unit price), `tax` (number — percent, e.g. `20`), optional `content` (string — description line under the title) |
| `headline` with `is_phase: true` | **Phase/section header** | `title` (string — the phase name), `is_phase: true`. There is NO rendered `"phase"` type — a phase is a headline block with `is_phase: true`. (Sending `type: "phase"` with `{title}` is accepted and converted.) |
| `headline` | Large heading | `title` (string), optional `content` (string) |
| `subheading` | Secondary heading | `title` (string) |
| `text` | Free-form paragraph | `content` (string) |

All numeric fields are JSON numbers, not strings. These are the field names
the editor, PDF templates, and totals actually read — other names (e.g.
`quantity`/`unit_price`, or `text` on headings) render as 0 or not at all.
The write normalizes the common aliases, but emit the canonical names, and
expect them when reading blocks back via `offers_get_blocks`.

### Example: 2 phases with positions

```json
{ "id": "<offer-id>", "blocks": [
  { "type": "headline",  "order_index": 0, "content_json": { "title": "Konzeption", "is_phase": true } },
  { "type": "line_item", "order_index": 1, "content_json": { "title": "Anforderungsanalyse", "amount": 2, "unit": "Tage", "cost_per_item": 1200, "tax": 20 } },
  { "type": "line_item", "order_index": 2, "content_json": { "title": "UX-Konzept", "amount": 3, "unit": "Tage", "cost_per_item": 1100, "tax": 20 } },
  { "type": "headline",  "order_index": 3, "content_json": { "title": "Umsetzung", "is_phase": true } },
  { "type": "line_item", "order_index": 4, "content_json": { "title": "Frontend-Entwicklung", "amount": 8, "unit": "Tage", "cost_per_item": 1300, "tax": 20 } },
  { "type": "text",      "order_index": 5, "content_json": { "content": "Alle Positionen verstehen sich zzgl. USt." } }
] }
```

## Tool Process

1. **Always read first**: Call `offers_get_blocks` before proposing any changes. Never guess the existing block list.
2. **Build the new block array**: Merge existing blocks with the requested changes, preserving `id` fields for existing blocks.
3. **Write**: Use `offers_replace_blocks` — this is a full replacement (atomic PUT).
4. Assign `order_index` sequentially starting at 0.

## Writing Blocks

Use `offers_replace_blocks` with `{ id: "<offer-id>", blocks: [...] }` — a full
replacement (atomic PUT). Omit `id` for new blocks (generated on write); keep
existing `id` values to preserve identity.

The write persists immediately. If the user has the offer open in the editor,
the new blocks appear there live (realtime); if they have unsaved local edits,
the editor shows a conflict banner instead of overwriting them.

**Act directly on drafts.** When the user asks for content ("add 4 positions",
"write a closing text"), write the blocks in the same turn — do NOT paste the
drafted content into chat and ask "should I apply this?". Drafts are low-risk,
the approval prompt (when configured) is the safety gate, and the user watches
the result appear live in the editor. Only ask when the request itself is
ambiguous.

## Working With Phases

Phases group line items when `phases_enabled: true` on the offer. A phase is a
`headline` block with `is_phase: true`, placed before the line items it
contains — the position (order_index) determines grouping; everything after a
phase headline belongs to that phase until the next one. Check the offer's
`phases_enabled` via `offers_get` and set it with `offers_update` when
introducing phases into an offer that has none.

## Safety

- Always read current blocks before writing.
- Preserve existing block IDs when updating (only change `content_json` or `order_index`, never change `type` in place).
- If the user asks to "remove" a block, build the new array excluding that block and write it.
- Confirm before large replacements (e.g. replacing all blocks with a new structure).
