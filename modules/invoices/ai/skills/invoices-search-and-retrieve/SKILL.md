---
name: invoices-search-and-retrieve
title: Invoice search and retrieval
description: List, filter, and retrieve invoices and their details.
allowed-tools: engenty_tools_search engenty_tool_execute
---

# Invoice Search and Retrieval

Use this skill to find and inspect invoices.

## Operations

| Goal | Operation | Input |
|------|-----------|-------|
| List all invoices | `invoices_list` | `{}` |
| Get one invoice | `invoices_get` | `{ idOrNumber }` |
| Get an invoice's positions | `invoices_get_blocks` | `{ id }` |
| Invoices for a client | `invoices_list_by_client` | `{ clientId }` |
| Next free number | `invoices_get_next_number` | `{}` |
| Module settings | `invoices_get_settings` | `{}` |

## Notes

- Prefer the preloaded page/list context when answering simple questions; call the operations above for fresh or complete data.
- Status values: `draft`, `issued`, `sent`, `paid`, `cancelled`. "Overdue" is derived (due_date passed and not paid), not a stored status.
- Use snake_case field names.
