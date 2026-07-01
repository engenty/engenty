---
name: contacts-search-and-retrieve
title: Contacts search and retrieval
description: Find stored contacts, retrieve records and relations, and summarize match evidence through catalog-backed Contacts operations.
allowed-tools: engenty_tools_search engenty_tool_execute web_search
---

# Contacts Search And Retrieve

Use this skill when the user asks to find existing contacts, organisations, people, roles, professions, cities, IDs, domains, relations, or similar records in the tenant Contacts database.

## Tool Process

1. Start with `engenty_tools_search` using `moduleId: "contacts"` and `kind: "tool"`.
2. Prefer registered `contacts.*` operations. Use HTTP routes only when no registered operation covers the task.
3. Use `engenty_tool_execute` before unfamiliar writes or when the required input shape is unclear.
4. Use `engenty_tool_execute` only after choosing the exact operation id and input.

## Search Operations

- Use `contacts_contact_search` for names, organisations, emails, domains, cities, professions, fuzzy descriptions, and requests that need match evidence. Pin `strategy: "lexical"` for exact name / id / email-prefix lookups (BM25-only, no embedder); leave `strategy` unset for fuzzy descriptions so vector recall is included.
- Use `contacts_list` for directories, pagination, sorted lists, exact filters, and broad inventory.
- Use `contacts_get` after search or list results when you need the complete record, linked invoice count, or exact field values.
- Use `contacts_list_relations` when the user asks who works at an organisation, which company a person belongs to, or whether two contacts are linked.

## Search Rules

- Search before asking broad clarifying questions when the user's text is already searchable.
- Keep the first search broad for professions or fuzzy descriptions. Do not turn a profession like "Anwalt" into a hard role filter unless the user explicitly names a known tenant role slug.
- Do not invent contacts that are not returned by a tool result.
- Summarize why each result matched using `matched_fields`, `match_reason`, and source scores when they are returned.
- Use `web_search` only for public enrichment or external context after internal contact search; it cannot verify what is stored in Contacts.
