---
name: company-profile-research-and-fill
title: Research and fill the company profile
description: Read the tenant's company profile, research missing fields from public sources, and write back only what the evidence supports.
allowed-tools: engenty_tools_search engenty_tool_execute web_search navigate
---

# Research and Fill the Company Profile

The company profile is what every offer, invoice and PDF prints as the sender —
name, address, VAT id, bank details. A wrong value here goes out on documents
that are legal and financial records, so evidence matters more than coverage.

## Tool Process

1. `company_profile_get` — **always first**. Never write a field without seeing
   what is stored; most "missing" fields are already filled.
2. `web_search` for public evidence: the company's own site, imprint /
   Impressum, contact page, commercial register entry.
3. `company_profile_set` to write. It is a **partial merge**: pass only the
   fields that change, omit a field to leave it alone, pass `null` to clear it.
4. `company_profile_set_logo` for the logo — do not write `logo_url` directly.

For a deeper, bounded research pass there is a dedicated action
(`company-profile.research`) run by the module agent; use it when the user wants
the whole profile researched rather than a field or two corrected.

## Fields

`name`, `brand_name`, `tag_line`, `company_type`, `owner`, `managing_director`,
`address_street`, `address_street_2`, `address_zip`, `address_city`,
`address_country`, `phone`, `email`, `website`, `imprint_url`,
`company_registration_number`, `tax_number`, `vat_id`, `bank_name`,
`bank_iban`, `bank_bic`, `bank_account_name`, `logo_url`.

Two distinctions worth keeping straight:

- `name` is the legal entity; `brand_name` is what customers call it. They are
  often different and both are used in documents.
- `tax_number`, `vat_id` and `company_registration_number` are three different
  identifiers. Do not fill one from another because the format looks similar.

## Evidence rules

- Write a field only when a source states it. An inferred address or a guessed
  legal form is worse than an empty field, because nobody will re-check it.
- **Never research bank details.** IBAN, BIC and account name come from the
  user, not from the web — a plausible-looking IBAN found online is either wrong
  or someone else's. Ask for them instead.
- Confirm legal identifiers (`vat_id`, `tax_number`,
  `company_registration_number`) with the user before saving, even with a
  source. Naming and address fields can be saved directly once evidenced.
- Cite the source when you report what you filled in.

## Reporting

`company_profile_set` returns the saved settings. Name the fields you actually
wrote — not the ones you researched — and say which you left alone and why.
Never report a save unless the operation returned success.

Skipping a field for lack of evidence is a result, not a failure: list what is
still empty so the user can supply it.

## Where the user sees it

`/settings/company-profile`. Navigate there after a batch of changes so they can
review what landed.
