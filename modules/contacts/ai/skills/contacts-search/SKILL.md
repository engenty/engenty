---
name: contacts-search
title: Search contacts
description: Find existing contacts with hybrid search and summarize evidence without inventing matches.
---

# Contacts Search

Use this skill when the user asks to find existing contacts, organisations, people, roles, professions, cities, IDs, domains, or similar contact database records.

## Strategy

1. Start with `contacts_contact_search` (find it through `engenty_tools_search` / `engenty_tools_discover`, run it through `engenty_tool_execute`) when the request is searchable from the provided text. Do not ask a broad clarifying question first for names, roles, professions, company types, emails, domains, cities, or identifiers.
2. Use structured filters when the user gives them: `filters.type` for person vs organisation and `filters.role` only when the user explicitly names a known tenant role slug. Do not turn professions like "Anwalt" into a hard person/role filter; let hybrid search match people, Kanzleien, and organisations.
3. Pin `strategy: "lexical"` for fast quick-lookup queries (exact names, IDs, email/domain prefixes) — explicit lexical skips the embedder and runs BM25-style only. Leave `strategy` unset (or `"hybrid"`) for fuzzy descriptions such as "Anwälte" or "people in Vienna" so vector recall kicks in.
4. Keep the first search broad for fuzzy descriptions, then refine if too many results come back.
5. Inspect ambiguous or important matches with `loadContact` before making a specific recommendation.
6. Summarize why each result matched using the returned `matched_fields` and `source_scores`. If there is no concrete match, say so and suggest a narrower search.

## Rules

- Do not invent contacts that are not returned by the tool.
- Deduplicate by contact id; the tool should already return unique contacts, but keep your summary unique too.
- Prefer evidence-backed wording such as "matched role and city" or "fuzzy match on organisation name" over generic confidence claims.
- Do not claim that internal search is broken or unavailable unless `contacts_contact_search` returned an explicit error in this turn; if that happens, quote the error briefly.
- Do not use `web_search` to check whether a contact exists in stored contacts. Use web search only after internal search when the user asks for public enrichment or external research.
