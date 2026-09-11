---
name: grounded-citations
description: Cite fetched claims with numbered, verifiable sources.
license: MIT
author: Hermes Agent + Teknium, adapted for Engenty
allowed-tools: skill_search skill web_search artifact_write
metadata:
  engenty:
    category: research
    origin: hermes-agent skills/research/grounded-citations
---

# Grounded citations

Every claim taken from an outside source gets an inline numbered citation and a `Sources:` list. Numbers come from retrieval this turn, never from memory.

## When to Use

Research, comparisons, news, or any artifact that reports outside facts. Skip for incidental syntax lookups and casual chat.

## Procedure

1. Search with `web_search` (and fetch/extract tools you actually have). Do not invent URLs.
2. Keep a ledger in working memory or a `/home` note: `url → [n]`, title, and a short verbatim quote that appears on the page. Reuse the same `[n]` for the same URL.
3. In the answer, cite `[n]` immediately after the claim. Flag model-only knowledge as `[unverified]`.
4. End with a `Sources:` list: `[n] title — url`.
5. If you write a document, use `artifact_write` so the user can check the citations. There is no Hermes `sources.py` ledger in this runtime — do not call it.

## Pitfalls

- Numbering sources you did not fetch this turn.
- Citing a search snippet as if you read the page.
- Dropping the `Sources:` block because the chat already showed links.
