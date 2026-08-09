---
title: PDF templates
description: How offers and invoices look when printed — layout, typography, colors and letterhead — and the agent operations for editing them.
---

# PDF templates

A template decides what an offer or invoice looks like on paper. Each one
belongs to a module (`offers` or `invoices`) and carries two things: the
**layout** (which blocks appear where) and the **design settings** (colors,
typography, margins, letterhead). One template per module is the default — the
one new documents print with.

Find it at **Settings → PDF templates**.

## Agent operations

These are the operations the copilot can run in this module. **Reads** never
change anything; **writes** do, and the ones that carry real consequence ask you
to approve them first.

| Operation | | What it does |
| --- | --- | --- |
| `pdf_templates_list` | Reads | List the templates for a module |
| `pdf_templates_get` | Reads | Get a template by id, or the module's default |
| `pdf_templates_preview` | Reads | Render a template against sample data without saving it |
| `pdf_templates_create` | Writes | Create a template — approval required |
| `pdf_templates_update` | Writes | Change a template — approval required |
| `pdf_templates_delete` | Writes | Delete a template — approval required, irreversible |

`pdf_templates_preview` is the safety net. Template markup fails quietly — a
mistyped element does not raise an error, it just renders as an empty block — so
the copilot is instructed to preview every change against real sample data
before saving, and to tell you what it saw.

Two things worth asking for explicitly:

- **A restyle** ("use our brand colors", "wider margins") changes only the design
  settings and leaves the layout alone. This is the safer request.
- **Making a template the default** demotes whichever template currently holds
  it, and changes what every new document prints with. The copilot will ask
  first.
