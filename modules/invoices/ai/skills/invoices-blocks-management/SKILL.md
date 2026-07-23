---
name: invoices-blocks-management
title: Invoice blocks management
description: Add, edit, and replace content blocks (line items, phases, headings, text) within a draft invoice.
allowed-tools: engenty_tools_search engenty_tool_execute
---

# Invoice Blocks Management

Use this skill when the user wants to add, edit, reorder, or remove content blocks inside a **draft** invoice — line items, phases, headings, and text sections. Only `draft` invoices can be edited; issued/sent/paid invoices are frozen (correct them via a Storno).

## Block Types

| type | Purpose | Key `content_json` fields |
|------|---------|--------------------------|
| `line_item` | Billable position | `title`, `quantity`, `unit`, `unit_price`, `tax_rate` |
| `phase` | Phase/milestone header | `title` |
| `headline` | Large heading | `text` |
| `subheading` | Secondary heading | `text` |
| `text` | Free-form paragraph | `text` |

All numeric fields in `content_json` are numbers, not strings. `tax_rate` is a percentage (e.g. `20`).

## Tool Process

1. **Always read first**: Call `invoices_get_blocks` before proposing changes. Never guess the existing block list.
2. **Build the new block array**: Merge existing blocks with the requested changes, preserving `id` fields for existing blocks. Omit `id` for new blocks.
3. **Write**: Use `invoices_replace_blocks` with `{ id: "<invoice-id>", blocks: [...] }` — a full atomic replacement. Cached totals (net/tax/gross) recompute automatically from line items.
4. Assign `order_index` sequentially starting at 0.

## Assembling from hours & materials

When building an invoice from tracked hours and material bookings, map each position to a `line_item` block. Flag plausibility gaps to the user (e.g. "3 h booked but no material — bill anyway?"). Do not silently drop or invent positions.

Find the source data through the catalog: `engenty_tools_search` with
`moduleId: "time-tracking"` for tracked hours — prefer
`time_tracking_entries_list` (raw entries) and
`time_tracking_entries_summarize` (totals). Use the projects/tasks modules for
scope context. If the time-tracking module is not installed or returns no
operations, say so and ask the user to provide the positions instead of
inventing them.

## Safety

- Always read current blocks before writing.
- Reject edits on non-draft invoices — explain that a Storno is required.
- Confirm before large replacements.
