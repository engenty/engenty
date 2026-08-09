---
title: Company profile
description: Your own company's details as they appear on every document — and the agent operations that research and maintain them.
---

# Company profile

Everything that identifies *you* on an outgoing document: legal name and brand
name, address, contact details, VAT and registration numbers, bank details, and
your logo. Offers and invoices print the sender block from here.

Find it at **Settings → Company profile**.

## Agent operations

These are the operations the copilot can run in this module. **Reads** never
change anything; **writes** do, and the ones that carry real consequence ask you
to approve them first.

| Operation | | What it does |
| --- | --- | --- |
| `company_profile_get` | Reads | Read the company profile |
| `company_profile_set` | Writes | Create or update profile fields (partial — omitted fields are untouched) |
| `company_profile_set_logo` | Writes | Set or clear the logo from an image URL or upload |
| `company_profile_upload_asset` | Writes | Upload an image and return a public URL |

The copilot can research public fields for you — official name, address,
imprint, registration number — and it is instructed to cite where each value
came from and to write only what the evidence supports.

**It will not research your bank details.** An IBAN found on the web is either
wrong or someone else's, and it would end up on invoices you send. Give those to
it directly, or type them in yourself.
