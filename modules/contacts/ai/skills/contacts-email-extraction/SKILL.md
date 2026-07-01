---
name: contacts-email-extraction
title: Contacts email extraction
description: Extract person and organisation candidates from an email, search duplicates, and create/link records only when explicitly allowed.
allowed-tools: engenty_tools_search engenty_tool_execute
---

# Contacts Email Extraction

Use this skill when the user provides an email body and asks to extract a person, company, or relationship into Contacts.

## Tool Process

1. Parse the email text into a proposed person, organisation, and relationship from the visible content.
2. Use `engenty_tools_search` with `moduleId: "contacts"` and `kind: "tool"` to find Contacts operations.
3. Use `contacts_contact_search` for the sender email, sender/person name, company name, domain, and any explicit organisation identifiers before proposing creation. Prefer `strategy: "lexical"` for exact email/name/id lookups so the lookup is fast and BM25-only.
4. Use `engenty_tool_execute` before `contacts_create` or `contacts_create_relation` if the input shape is not clear.
5. Use `engenty_tool_execute` for the selected `contacts.*` operations.

## Duplicate Checks

- Search by email first when a sender address exists.
- Search by person name and company name separately.
- Search by website domain when the email domain looks like a company domain.
- If matches are ambiguous, present the candidates and ask which existing record to use.

## Creation And Linking

- Only create missing contacts when the action input or user instruction clearly allows creation.
- Use `contacts_create` for missing person or organisation records. Required fields are `display_name` and `type`.
- Use `contacts_create_relation` only after both contact ids are known and the relation is supported by the email evidence.
- For a person working at an organisation, use relation type `works_at` and include role/title only when it appears in the email.

## Reporting

- Separate extracted facts, existing matches, proposed new records, and proposed links.
- Do not claim a record was created until the `contacts_create` result returns it.
- Do not guess links when duplicate checks remain ambiguous.
