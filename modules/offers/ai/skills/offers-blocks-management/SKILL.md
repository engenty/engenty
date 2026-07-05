---
name: offers-blocks-management
title: Offer blocks management
description: Add, edit, and replace content blocks (line items, phases, headings, text) within an offer.
allowed-tools: engenty_tools_search engenty_tool_execute
---

# Offer Blocks Management

Use this skill when the user wants to add, edit, reorder, or remove content blocks inside an offer — line items, phases, headings, and text sections.

## Block Types

| type | Purpose | Key `content_json` fields |
|------|---------|--------------------------|
| `line_item` | Billable position | `title`, `quantity`, `unit`, `unit_price`, `tax_rate` |
| `phase` | Phase/milestone header | `title` |
| `headline` | Large heading | `text` |
| `subheading` | Secondary heading | `text` |
| `text` | Free-form paragraph | `text` |

All numeric fields in `content_json` are numbers, not strings. `tax_rate` is a percentage (e.g. `20` for 20%).

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

## Working With Phases

Phases group line items when `phases_enabled: true` on the offer. A phase block appears before the line items it contains. The AI does not need to link line items to phases — the position (order_index) determines grouping visually.

## Safety

- Always read current blocks before writing.
- Preserve existing block IDs when updating (only change `content_json` or `order_index`, never change `type` in place).
- If the user asks to "remove" a block, build the new array excluding that block and write it.
- Confirm before large replacements (e.g. replacing all blocks with a new structure).
