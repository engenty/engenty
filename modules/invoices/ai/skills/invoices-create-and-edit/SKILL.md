---
name: invoices-create-and-edit
title: Invoice create and edit
description: Create draft invoices, edit draft fields, and drive the invoice lifecycle.
allowed-tools: engenty_tools_search engenty_tool_execute
---

# Invoice Create and Edit

Use this skill to create and update invoices and move them through their lifecycle.

## Operations

| Goal | Operation | Input |
|------|-----------|-------|
| Create a draft | `invoices_create` | `{ number, date, dueDate, sumNetto, tax, sumBrutto, clientId?, title? }` |
| Update a draft | `invoices_update` | `{ id, patch }` |
| Replace positions | `invoices_replace_blocks` | `{ id, blocks }` (see blocks skill) |
| Issue (Festschreibung) | `invoices_issue` | `{ id }` |
| Mark sent / paid | `invoices_set_status` | `{ id, status }` |
| Cancel via Storno | `invoices_cancel` | `{ id }` |
| Delete a draft | `invoices_delete` | `{ id }` |
| Update settings | `invoices_set_settings` | `{ ...settings }` |

## Lifecycle rules (legal)

- `draft` is the only editable state. `invoices_update`, `invoices_replace_blocks`, and `invoices_delete` are rejected on non-drafts.
- `invoices_issue` is the **owner approval gate** (draft → issued): it freezes the number and blocks and stamps the issue date. Never issue without explicit user confirmation.
- Correct an issued invoice only via `invoices_cancel`, which creates a linked Storno (negative mirror) and marks the original `cancelled`.
- Use `invoices_get_next_number` for a fresh number when creating.

## The "finish but don't send" contract

Assemble a complete draft (positions, totals, plausibility notes), then stop and present it. The owner reviews and issues/sends. Do not send.
