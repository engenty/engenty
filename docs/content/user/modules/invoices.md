---
title: Invoices
description: Invoices from draft to issued, cancellations via Storno, and the agent operations the copilot uses.
---

# Invoices

Invoices work like [offers](/docs/user/modules/offers) — metadata plus blocks — with
the extra rules that billing demands. **Issuing** an invoice finalizes it and is
gated behind owner approval; after that it is a record, and the way to undo it
is a cancellation (Storno), not an edit.

Numbering, currency and tax come from
[Commercial settings](/docs/user/modules/commercial-settings).

## Agent operations

These are the operations the copilot can run in this module. **Reads** never
change anything; **writes** do, and the ones that carry real consequence ask you
to approve them first.

| Operation | | What it does |
| --- | --- | --- |
| `invoices_list` | Reads | List invoices |
| `invoices_list_by_client` | Reads | List invoices by client ID |
| `invoices_count_by_client_ids` | Reads | Count invoices per client (batched) |
| `invoices_get` | Reads | Get invoice by ID or number |
| `invoices_get_blocks` | Reads | Get invoice blocks |
| `invoices_get_next_number` | Reads | Get the next invoice number |
| `invoices_get_settings` | Reads | Get invoice settings |
| `invoices_create` | Writes | Create invoice |
| `invoices_update` | Writes | Update invoice |
| `invoices_replace_blocks` | Writes | Replace invoice blocks |
| `invoices_issue` | Writes | Issue (finalize) an invoice — owner approval gate |
| `invoices_cancel` | Writes | Cancel an invoice via a linked Storno |
| `invoices_set_status` | Writes | Set status (sent / paid) |
| `invoices_set_settings` | Writes | Update invoice settings |
| `invoices_delete` | Writes | Delete invoice |
