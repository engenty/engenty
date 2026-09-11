---
name: contacts-enhance-contact
title: Enhance contact
description: Research reference for the enhance-contact workflow's research step — source priority and contacts field naming.
allowed-tools: web_search
---

# Contacts Enhance Contact

Reference for the research step of the `contacts.enhance-contact` workflow. The
step's own instruction is the brief; this file carries the contacts-specific
knowledge the brief does not repeat.

The workflow loads the contact, runs this research, asks the user to approve the
changes, and writes them. The research step itself neither reads nor writes the
record — it is handed the current state and returns proposed field values.

## Source priority

1. The company's own site: imprint, legal notice, contact page.
2. Official registers — commercial register, EU VIES for VAT, national tax
   registers.
3. Everything else, including directories and aggregators, only as corroboration.

Newer beats older when the dates are evident. When they are not, leave the field
out: a wrong value the user waves through is worse than a gap.

## Field naming

Use the field names exactly as they appear on the record handed to the step.
Two that are commonly guessed wrong:

- the additional address line is `address_info`, not `address_street_additional`
- person-only fields are out of scope; this is organisation enrichment
